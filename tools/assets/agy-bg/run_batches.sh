#!/bin/bash
# 分批跑 agy 生圖（每批並行 5 張），已存在的輸出會略過
cd "$(dirname "$0")"
jobs_list=()
for id in aurora_night desert_temple harvest_farm moon_ruins sky_meadow tropic_coast volcano_rift; do
  [ "$id" = aurora_night ] && [ ! -f aurora_night_far_v2.png ] && jobs_list+=("aurora_night:aurora_night.prompt.txt:aurora_night_far.png")
  for k in hills_far hills_near; do
    [ -f ${id}_${k}_raw.png ] || jobs_list+=("$id:${id}_${k}.prompt.txt:${id}_${k}_raw.png")
  done
done
i=0
while [ $i -lt ${#jobs_list[@]} ]; do
  pids=()
  for j in "${jobs_list[@]:$i:5}"; do
    IFS=: read id pf out <<< "$j"
    [ "$out" = aurora_night_far.png ] && mv -f aurora_night_far.png aurora_night_far_old.png 2>/dev/null
    agy -p "$(cat $pf)" --mode accept-edits > "${pf%.prompt.txt}.log" 2>&1 &
    pids+=($!)
  done
  wait "${pids[@]}"
  i=$((i+5))
done
echo ALLDONE
