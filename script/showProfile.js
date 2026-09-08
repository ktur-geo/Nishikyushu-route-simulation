const missingElevationBandPlugin = {
  id: "missingElevationBand",

  beforeDatasetsDraw(chart, args, options) {
    const ranges = options?.ranges || [];
    if (!ranges.length) return;

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const { ctx, chartArea } = chart;

    if (!xScale || !yScale || !chartArea) return;

    // 0mの位置
    const rawY0 = yScale.getPixelForValue(0);

    // 0mがグラフ表示範囲外の場合は、
    // グラフの上端・下端付近に帯を表示する
    const y0 = Math.min(
      chartArea.bottom - 4,
      Math.max(chartArea.top + 4, rawY0)
    );

    const bandHeight = options?.bandHeight ?? 8;

    const bandTop = Math.max(
      chartArea.top,
      y0 - bandHeight / 2
    );

    const bandBottom = Math.min(
      chartArea.bottom,
      y0 + bandHeight / 2
    );

    ctx.save();

    ctx.fillStyle =
      options?.color ??
      "rgba(120, 200, 255, 0.45)";

    for (const range of ranges) {
      let x1 = xScale.getPixelForValue(range.start);
      let x2 = xScale.getPixelForValue(range.end);

      x1 = Math.max(
        chartArea.left,
        Math.min(chartArea.right, x1)
      );

      x2 = Math.max(
        chartArea.left,
        Math.min(chartArea.right, x2)
      );

      if (x2 < x1) {
        [x1, x2] = [x2, x1];
      }

      ctx.fillRect(
        x1,
        bandTop,
        x2 - x1,
        bandBottom - bandTop
      );
    }

    ctx.restore();
  }
};


export function drawProfileChart({
  canvasId,
  samples,
  designHeights,
  dx = 100,
  missingNoteId = "profile-missing-elevation-note",
  distanceOffsetMeters = 0,
  existingTerrain = [],
  existingTrack = [],
  additionalStations = [],
  fullRouteMode = false
}) {

  const ctx =
    document
      .getElementById(canvasId)
      .getContext("2d");

  const {
    terrain,
    design,
    stations,
    missingRanges
  } = buildProfileData(
    samples,
    designHeights,
    dx
  );

  const shiftPoint = point => ({
    ...point,
    x: point.x + distanceOffsetMeters
  });

  const shiftedTerrain =
    terrain.map(shiftPoint);

  const shiftedDesign =
    design.map(shiftPoint);

  const combinedStations = [
    ...stations.map(shiftPoint),
    ...additionalStations
  ].sort((a, b) => a.x - b.x);

  const shiftedMissingRanges =
    missingRanges.map(range => ({
      start:
        range.start
        + distanceOffsetMeters,
      end:
        range.end
        + distanceOffsetMeters
    }));

  const terrainLabel =
    fullRouteMode
      ? "新線の地形"
      : "地形";

  const designLabel =
    fullRouteMode
      ? "新線の設計線"
      : "設計線";

  // 標高未取得の注釈表示
  updateMissingElevationNote(
    missingNoteId,
    shiftedMissingRanges.length > 0
  );

  // 既存チャートがあれば破棄（再描画用）
  if (window._profileChart) {
    window._profileChart.destroy();
  }

  window._profileChart = new Chart(ctx, {
    type: "line",

    // このチャートだけで使用するプラグイン
    plugins: [
      missingElevationBandPlugin
    ],

    data: {
      datasets: [
        {
          label: terrainLabel,
          data: shiftedTerrain,
          borderColor: "#8b5a2b",
          borderWidth: 2,
          fill: false,
          pointRadius: 0,

          // null部分を線でつながない
          spanGaps: false
        },

        {
          label: designLabel,
          data: shiftedDesign,
          borderWidth: 2,
          fill: false,
          pointRadius: 0,

          // 工法別に色分け
          segment: {
            borderColor: ctx => {
              const i = ctx.p0.dataIndex;

              const terrainY =
                shiftedTerrain[i]?.y;

              // 地表標高未取得の場合は
              // 工法色ではなく通常の青色
              if (!Number.isFinite(terrainY)) {
                return "#0066cc";
              }

              return shiftedDesign[i].y < terrainY
                ? "#003399" // トンネル
                : "#009933"; // 高架・地上
            }
          }
        },

        ...(existingTerrain.length
          ? [
              {
                label: "既存線沿線の地形",
                data: existingTerrain,
                borderColor: "#8b5a2b",
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                spanGaps: false
              }
            ]
          : []),

        ...(existingTrack.length
          ? [
              {
                label: "既存線の線路高",
                data: existingTrack,
                borderColor: "#d97706",
                borderWidth: 2.5,
                fill: false,
                pointRadius: 0,
                spanGaps: false
              }
            ]
          : []),

        {
          label: "駅",
          data: combinedStations,
          type: "scatter",
          backgroundColor: "red",
          pointRadius: 4
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,

      interaction: {
        mode: "nearest",
        intersect: false
      },

      plugins: {

        // 標高未取得区間の水色帯
        missingElevationBand: {
          ranges: shiftedMissingRanges,
          color: "rgba(120, 200, 255, 0.45)",
          bandHeight: 8
        },

        legend: {
          display: true
        },

        tooltip: {
          enabled: true,

          callbacks: {
            label: ctx => {

              const x = ctx.parsed.x;
              const y = ctx.parsed.y;

              const idx =
                samples.findIndex(
                  sample =>
                    sample.distanceMeters
                      >= x - distanceOffsetMeters
                );

              let text =
                `${ctx.dataset.label}: ${y.toFixed(1)} m`;

              if (
                ctx.dataset.label === "駅"
                && ctx.raw?.name
              ) {
                text = `${ctx.raw.name}: ${y.toFixed(1)} m`;
              }

              if (
                ctx.dataset.label === designLabel &&
                samples[idx]
              ) {

                // 標高未取得地点の場合
                if (
                  !Number.isFinite(
                    samples[idx].elevation
                  )
                ) {
                  text += " / 地表標高未取得";
                }

                const next =
                  samples[idx + 1];

                if (
                  next &&
                  Number.isFinite(
                    designHeights[idx + 1]
                  )
                ) {

                  const dh =
                    designHeights[idx + 1] -
                    designHeights[idx];

                  const segmentDistance =
                    next.distanceMeters -
                    samples[idx].distanceMeters;

                  if (
                    Number.isFinite(
                      segmentDistance
                    ) &&
                    segmentDistance > 0
                  ) {

                    const slope =
                      (dh / segmentDistance) *
                      1000;

                    text +=
                      ` / 勾配 ${slope.toFixed(1)}‰`;
                  }
                }
              }

              return text;
            }
          }
        }
      },

      scales: {
        x: {
          type: "linear",

          title: {
            display: true,
            text: fullRouteMode
              ? "長崎からの距離 [km]"
              : "距離 [m]"
          },

          ticks: fullRouteMode
            ? {
                callback: value =>
                  (Number(value) / 1000)
                    .toFixed(0)
              }
            : {}
        },

        y: {
          title: {
            display: true,
            text: "標高 [m]"
          }
        }
      }
    }
  });
}


/*
 * 断面図表示用データを作成する。
 *
 * 計算上は標高未取得地点を0mとして扱うが、
 * 地形線ではnullのまま残し、
 * 「実際の0m」と「標高未取得」を区別する。
 */
export function buildProfileData(
  samples,
  designHeights,
  dx = 100
) {

  const terrain = [];
  const design = [];
  const stations = [];

  for (
    let i = 0;
    i < samples.length;
    i++
  ) {

    const x =
      samples[i].distanceMeters ??
      i * dx;

    const hasElevation =
      Number.isFinite(
        samples[i].elevation
      );

    // グラフの地形表示用
    // 未取得の場合はnullにして線を切る
    const terrainHeight =
      hasElevation
        ? samples[i].elevation
        : null;

    // 計算上の高さ
    // 未取得の場合は0m
    const calculationHeight =
      hasElevation
        ? samples[i].elevation
        : 0;

    terrain.push({
      x,
      y: terrainHeight
    });

    design.push({
      x,
      y: designHeights[i]
    });

    if (samples[i].isStation) {
      stations.push({
        x,
        y: calculationHeight
      });
    }
  }

  const missingRanges =
    buildMissingElevationRanges(
      samples,
      dx
    );

  return {
    terrain,
    design,
    stations,
    missingRanges
  };
}


/*
 * 標高未取得地点を連続した区間にまとめる。
 *
 * 1点だけ未取得の場合でも、
 * 前後サンプルとの中間点までを
 * その地点が代表する区間として扱う。
 */
function buildMissingElevationRanges(
  samples,
  dx = 100
) {

  if (!samples.length) {
    return [];
  }

  const distances =
    samples.map(
      (sample, i) =>
        sample.distanceMeters ??
        i * dx
    );

  const ranges = [];

  for (
    let i = 0;
    i < samples.length;
    i++
  ) {

    // 標高取得済みなら何もしない
    if (
      Number.isFinite(
        samples[i].elevation
      )
    ) {
      continue;
    }

    const current =
      distances[i];

    // 未取得点が代表する範囲の左端
    const start =
      i === 0
        ? current
        : (
            distances[i - 1] +
            current
          ) / 2;

    // 未取得点が代表する範囲の右端
    const end =
      i === samples.length - 1
        ? current
        : (
            current +
            distances[i + 1]
          ) / 2;

    const previous =
      ranges[ranges.length - 1];

    // 前の未取得区間と連続していれば結合
    if (
      previous &&
      start <= previous.end + 1e-6
    ) {

      previous.end =
        Math.max(
          previous.end,
          end
        );

    } else {

      ranges.push({
        start,
        end
      });
    }
  }

  return ranges;
}


/*
 * 標高未取得の注釈を表示・非表示
 */
function updateMissingElevationNote(
  noteId,
  hasMissingElevation
) {

  const note =
    document.getElementById(noteId);

  if (!note) {
    return;
  }

  note.hidden =
    !hasMissingElevation;
}
