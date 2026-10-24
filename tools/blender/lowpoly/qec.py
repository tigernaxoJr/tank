r"""MeshLab Quadric Edge Collapse（純幾何；貼圖之後用 bake.py 重烘）
   venv\Scripts\python.exe -I qec.py <in.ply> <out.ply> <target_tris> [key=val ...]
常用 key：
  mincomp=25     先刪除小於此面數的浮動碎片（0=不刪）
  passes=2       分幾段降（先到 target*8 再到 target）；MeshLab 建議多段降面
  qthr=0.3       qualitythr：避免產生細長 / 退化三角形的門檻（0~1，越大越嚴）
  normal=1       preservenormal：禁止翻面
  boundary=1     preserveboundary（boundaryweight 用 bw=）
  topo=0         preservetopology（保留 genus；可能降不到目標）
  planar=1       planarquadric（平面區加權，讓平面區三角形較均勻）
  weights=<npz>  逐頂點重要度（weights.py 產生）→ 寫入 vertex quality 並開 qualityweight
  wk=1           誤差放大倍數 M = (w_thin * w_col * boost) ** wk，夾在 1..100（內部換算成 vcglib 的 quality）
  tref=0.03      厚度小於 tref 視為細薄：w_thin = 1 + clip(tref/厚度 - 1, 0, tcap)
  tcap=7
  cgain=4        貼圖對比權重：w_col = 1 + cgain * 正規化對比
  boost=x,y,z,r,f;...  球形區域重要度再乘 f（分部件預算；需搭配 weights=）
  repair=0      （實測有害，預設關）=1 時降面前先在高模上修非流形邊 / 頂點（降面後只刪 <6 面的碎塊）
"""
import sys
import numpy as np
import pymeshlab as pml
from scipy.spatial import cKDTree

src, dst, target = sys.argv[1], sys.argv[2], int(sys.argv[3])
o = dict(mincomp='25', passes='2', qthr='0.3', normal='1', boundary='1', bw='1', topo='0',
         planar='1', weights='', wk='1', tref='0.03', tcap='7', cgain='4', repair='0')
for kv in sys.argv[4:]:
    k, v = kv.split('=', 1)
    o[k] = v

ms = pml.MeshSet()
ms.load_new_mesh(src)
ms.meshing_remove_duplicate_vertices()
ms.meshing_remove_duplicate_faces()
ms.meshing_remove_null_faces()
if int(o['mincomp']) > 0:
    ms.meshing_remove_connected_component_by_face_number(mincomponentsize=int(o['mincomp']))
if o['repair'] == '1':  # 高模上先修非流形（只佔百萬面中的幾百面，降面後不會變成大洞）
    ms.meshing_repair_non_manifold_edges(method='Remove Faces')
    ms.meshing_repair_non_manifold_vertices(vertdispratio=0)
    if int(o['mincomp']) > 0:
        ms.meshing_remove_connected_component_by_face_number(mincomponentsize=int(o['mincomp']))
ms.meshing_remove_unreferenced_vertices()
print('[qec] after clean faces', ms.current_mesh().face_number())

use_w = bool(o['weights'])
if use_w:
    d = np.load(o['weights'])
    m = ms.current_mesh()
    v = m.vertex_matrix()
    _, idx = cKDTree(d['pos']).query(v)
    th, con = d['thick'][idx], d['con'][idx]
    p50, p99 = np.percentile(d['con'], [50, 99])
    cn = np.clip((con - p50) / (p99 - p50), 0, 1)
    w_thin = 1 + np.clip(float(o['tref']) / np.maximum(th, 1e-4) - 1, 0, float(o['tcap']))
    w_col = 1 + float(o['cgain']) * cn
    M = np.power(w_thin * w_col, float(o['wk']))
    # 分部件預算：球形區域內的重要度再乘上 f（例如眼睛、砲口），等同手刷 vertex group
    for s in filter(None, o.get('boost', '').split(';')):
        x, y, z, r, f = map(float, s.split(','))
        dd = np.linalg.norm(v - np.array([x, y, z]), axis=1)
        M *= np.where(dd < r, f, 1.0)
    # vcglib 的 QualityWeight：quadric *= 1 + ((Q-minQ)/(maxQ-minQ))^2 * 99（min-max 正規化 + 平方，上限 100 倍）
    # 為了讓 M 就是「誤差放大倍數」，反推 Q = sqrt((M-1)/99)，並加一個不被引用的假頂點把 min/max 固定在 0/1
    M = np.clip(M, 1, 100)
    print('[qec] multiplier pct50/90/99/max', np.percentile(M, [50, 90, 99]).round(2), M.max().round(2))

    def push(vv, ff, mm):
        q = np.sqrt((mm - 1) / 99.0)
        vv = np.vstack([vv, vv.max(0) + 10, vv.max(0) + 11])
        q = np.concatenate([q, [0.0, 1.0]])
        ms.add_mesh(pml.Mesh(vertex_matrix=vv, face_matrix=ff, v_scalar_array=q), 'weighted')
    push(v, m.face_matrix(), M)

passes = int(o['passes'])
cur = ms.current_mesh().face_number()
steps = [max(target, int(target * 8 ** (passes - 1 - i))) for i in range(passes)]
for t in steps:
    if t >= cur:
        continue
    ms.meshing_decimation_quadric_edge_collapse(
        targetfacenum=t, qualitythr=float(o['qthr']), preserveboundary=o['boundary'] == '1',
        boundaryweight=float(o['bw']), preservenormal=o['normal'] == '1',
        preservetopology=o['topo'] == '1', optimalplacement=True, planarquadric=o['planar'] == '1',
        planarweight=0.001, qualityweight=use_w, autoclean=True)
    cur = ms.current_mesh().face_number()
    print('[qec] pass ->', cur)
    if use_w and t != steps[-1]:  # 下一段前重新放回假頂點，保持倍數語意
        ms.meshing_remove_unreferenced_vertices()
        cm = ms.current_mesh()
        push(cm.vertex_matrix(), cm.face_matrix(), 1 + 99 * cm.vertex_scalar_array() ** 2)
ms.meshing_remove_connected_component_by_face_number(mincomponentsize=6)
ms.meshing_remove_unreferenced_vertices()
ms.save_current_mesh(dst, save_vertex_quality=False, save_vertex_color=False, binary=True)
print('[qec] wrote', dst, ms.current_mesh().face_number())
