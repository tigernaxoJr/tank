# 坦克拆件 prompt 範本（車身 + 可旋轉砲管）

目的：生出來的車身與砲管在砲管轉 14°~80° 時接縫不露餡。分兩步：先生整台當基準，再用基準圖生拆件。
把 `{…}` 換成該機種的內容；每步都附上前一步的圖當參考。

## 步驟 1：整台組裝圖（風格與比例基準）

```
Game asset, a cartoon artillery tank character: {角色描述，例如 a steampunk seahorse with a long snout that is the cannon}.
Pure side view facing right, the barrel horizontal. Soft toon shading, thick dark outline, light from the upper left.
Flat solid {#FF00FF} background, no ground, no shadow, no text.
The barrel must look like a separate cylindrical part that plugs into the body through a ring-shaped sleeve on the body.
```

## 步驟 2：車身（無砲管）

附步驟 1 的圖當參考，內容與風格完全相同：

```
Same character, same style, same lighting and colors as the reference.
Draw ONLY the body, with the barrel completely removed.
At the muzzle position draw a round ring-shaped sleeve (collar) that belongs to the body.
The center of the collar is an open socket: show a dark empty hole inside it, NOT a closed cap, NOT a flat disc.
Pure side view facing right, flat solid {#FF00FF} background, no shadow, no text.
```

## 步驟 3：砲管（單獨）

附步驟 1、2 的圖當參考：

```
Same style, same colors and same light direction as the reference, same scale as the body image.
Draw ONLY the barrel, horizontal, pointing right, pure side view.
The base (left) end is a plain straight cylinder with the same width as the collar opening, continuing past what is needed
(about 20% extra length) because that part will be hidden inside the body's collar.
No ball, no ring, no cap, no decoration at the base end; the decoration belongs only to the muzzle (right) end.
Flat solid {#FF00FF} background, no shadow, no text.
```

## 驗收（必做，prompt 只能降低失敗率）

1. 去背、切割後把車身與砲管以砲管轉軸（collar 圓心）對齊，在 14° / 45° / 80° 三個仰角各合成一張。
2. 砲管底端不得露出、護套內不得看到封口或空隙；不合格就重生，或用 alpha 遮罩手動補。
3. 通過後才填 `tankRegistry` 的 `sprite.pivotX / pivotY`（轉軸 = collar 圓心）。

## 常見失敗

- 車身仍畫成封死的圓蓋：prompt 加重 “open socket, dark hole, no cap”，或手動削掉。
- 砲管底端又加了球或環：加 “plain cylinder, no decoration at the base end”，或裁掉。
- 兩張色調不一致：永遠附基準圖，並在 prompt 寫 “same colors as the reference”。
