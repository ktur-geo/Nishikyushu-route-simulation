import {
  haversineDistanceMeters,
  findNearestSegment
} from './utils.js';

import {
  nishikyushuCompetedRoute,
  kyushuCompetedRoute,
  getPoints,
  getInitStations
} from './points.js';


// ========================================
// 設定値
// ========================================

const MAX_SPEED_MPS =
  260 / 3.6;

const ACCELERATION_MPS2 =
  2.6 / 3.6;

const DECELERATION_MPS2 =
  2.7 / 3.6;

const DWELL_MINUTES =
  2;


// ========================================
// 駅間走行時間
// ========================================

/**
 * 距離(m)から走行時間(分)を求める。
 *
 * 等加速・等減速を仮定。
 * 停車時間は含めない。
 */
export function calculateRunningTimeMinutes(
  distance
) {

  if (
    !Number.isFinite(distance)
    || distance <= 0
  ) {
    return 0;
  }


  const accelerationDistance =
    MAX_SPEED_MPS ** 2
    / (2 * ACCELERATION_MPS2);


  const decelerationDistance =
    MAX_SPEED_MPS ** 2
    / (2 * DECELERATION_MPS2);


  const distanceToMaxSpeed =
    accelerationDistance
    + decelerationDistance;


  let seconds;


  /*
   * 260km/hまで到達できる場合
   */
  if (
    distance >= distanceToMaxSpeed
  ) {

    seconds =
      MAX_SPEED_MPS
        / ACCELERATION_MPS2
      +
      (
        distance
        - distanceToMaxSpeed
      )
        / MAX_SPEED_MPS
      +
      MAX_SPEED_MPS
        / DECELERATION_MPS2;

  } else {

    /*
     * 短距離駅間。
     *
     * 260km/hには到達せず、
     * 加速からそのまま減速へ移る。
     */
    const peakSpeed =
      Math.sqrt(
        (2 * distance)
        /
        (
          1 / ACCELERATION_MPS2
          +
          1 / DECELERATION_MPS2
        )
      );


    seconds =
      peakSpeed
        / ACCELERATION_MPS2
      +
      peakSpeed
        / DECELERATION_MPS2;
  }


  return seconds / 60;
}


// ========================================
// 既存線上の距離
// ========================================

/**
 * 既存線上の投影点から、
 * ポリライン終端までの距離を求める。
 *
 * towardEnd === true
 *   投影点 → route末端
 *
 * towardEnd === false
 *   投影点 → route先頭
 */
function distanceAlongPolylineFromProjected(
  route,
  segIndex,
  t,
  towardEnd = true
) {

  const p1 =
    route[segIndex];

  const p2 =
    route[segIndex + 1];


  const projectedPoint = {

    lat:
      p1.lat
      + (p2.lat - p1.lat)
        * t,

    lng:
      p1.lng
      + (p2.lng - p1.lng)
        * t

  };


  let distance = 0;


  if (towardEnd) {

    /*
     * 投影点 → 現在線分終端
     */
    distance +=
      haversineDistanceMeters(
        projectedPoint,
        p2
      );


    /*
     * 残りの線分
     */
    for (
      let i = segIndex + 1;
      i < route.length - 1;
      i++
    ) {

      distance +=
        haversineDistanceMeters(
          route[i],
          route[i + 1]
        );
    }

  } else {

    /*
     * 投影点 → 現在線分始端
     */
    distance +=
      haversineDistanceMeters(
        projectedPoint,
        p1
      );


    /*
     * それより前の線分
     */
    for (
      let i = segIndex - 1;
      i >= 0;
      i--
    ) {

      distance +=
        haversineDistanceMeters(
          route[i + 1],
          route[i]
        );
    }
  }


  return distance;
}


/**
 * 任意地点を既存線へ投影し、
 * そこから既存線の終端までの距離を求める。
 */
function getDistanceToRouteEnd(
  route,
  latlng
) {

  if (
    !Array.isArray(route)
    || route.length < 2
    || !latlng
  ) {

    return null;
  }


  const segment =
    findNearestSegment(
      route,
      latlng
    );


  if (
    !segment
    || segment.index < 0
  ) {

    return null;
  }


  return distanceAlongPolylineFromProjected(
    route,
    segment.index,
    segment.t,
    true
  );
}


// ========================================
// 新線上の累積距離
// ========================================

/**
 * 新線上について、
 * 先頭点から各ポイントまでの累積距離を返す。
 */
function getNewLineCumulativeDistances(
  points
) {

  if (
    !Array.isArray(points)
    || points.length === 0
  ) {

    return [];
  }


  const distances =
    [0];


  for (
    let i = 1;
    i < points.length;
    i++
  ) {

    const segmentDistance =
      haversineDistanceMeters(
        points[i - 1].latlng,
        points[i].latlng
      );


    distances[i] =
      distances[i - 1]
      +
      (
        Number.isFinite(
          segmentDistance
        )
          ? segmentDistance
          : 0
      );
  }


  return distances;
}


// ========================================
// 時間計算モデル
// ========================================

/**
 * 長崎～博多を一続きの経路として扱い、
 * 実際に停車する地点の累積距離を作る。
 *
 * curve は停車しない。
 *
 * 新線との接続位置は、
 * point.typeではなく、
 * points配列の先頭・末尾で判断する。
 *
 * そのため、
 * startStation / endStation を
 * curveへ変更しても接続位置は維持される。
 */
function buildTimeModel(
  points
) {

  if (
    !Array.isArray(points)
    || points.length < 2
  ) {

    return null;
  }


  /*
   * 新線の接続点。
   *
   * typeに依存せず、
   * 最初と最後のポイントを使用する。
   */
  const startPoint =
    points[0];

  const endPoint =
    points[
      points.length - 1
    ];


  if (
    !startPoint?.latlng
    || !endPoint?.latlng
  ) {

    return null;
  }


  /*
   * 長崎
   * ↓
   * 西九州新幹線既存線
   * ↓
   * 新線始点
   */
  const nishikyushuDistance =
    getDistanceToRouteEnd(
      nishikyushuCompetedRoute,
      startPoint.latlng
    );


  /*
   * 新線終点
   * ↓
   * 九州新幹線既存線
   * ↓
   * 博多
   */
  const kyushuDistance =
    getDistanceToRouteEnd(
      kyushuCompetedRoute,
      endPoint.latlng
    );


  if (
    !Number.isFinite(
      nishikyushuDistance
    )
    ||
    !Number.isFinite(
      kyushuDistance
    )
  ) {

    return null;
  }


  /*
   * 新線内の各ポイントまでの距離
   */
  const newLineDistances =
    getNewLineCumulativeDistances(
      points
    );


  if (
    newLineDistances.length
    !== points.length
  ) {

    return null;
  }


  const newLineDistance =
    newLineDistances[
      newLineDistances.length - 1
    ];


  /*
   * 九州新幹線との接続地点までの
   * 長崎からの累積距離
   */
  const kyushuStartDistance =
    nishikyushuDistance
    + newLineDistance;


  /*
   * 長崎～博多の全距離
   */
  const totalDistance =
    kyushuStartDistance
    + kyushuDistance;


  /*
   * 長崎と博多は必ず停車駅。
   */
  const stops = [
    0,
    totalDistance
  ];


  const initStations =
    getInitStations()
    || [];


  // ========================================
  // 西九州新幹線側の既存駅
  // ========================================

  for (
    const station
    of initStations
  ) {

    if (
      station.type
      !== "nishikyushu"
    ) {

      continue;
    }


    const stationDistance =
      getDistanceToRouteEnd(
        nishikyushuCompetedRoute,
        {
          lat:
            station.lat,

          lng:
            station.lng
        }
      );


    /*
     * 長崎と新線接続地点の間に存在する
     * 既存駅のみ停車駅として追加する。
     *
     * 長崎自体と接続地点自体は除外。
     */
    if (
      Number.isFinite(
        stationDistance
      )
      &&
      stationDistance > 5
      &&
      stationDistance
        < nishikyushuDistance - 5
    ) {

      stops.push(
        stationDistance
      );
    }
  }


  // ========================================
  // 新線上の駅
  // ========================================

  for (
    let i = 0;
    i < points.length;
    i++
  ) {

    /*
     * curve は通過点なので停車しない。
     */
    if (
      points[i].type
      === "curve"
    ) {

      continue;
    }


    const distance =
      nishikyushuDistance
      + newLineDistances[i];


    /*
     * 長崎・博多そのものは
     * 既に追加済み。
     */
    if (
      distance > 5
      &&
      distance
        < totalDistance - 5
    ) {

      stops.push(
        distance
      );
    }
  }


  // ========================================
  // 九州新幹線側の既存駅
  // ========================================

  for (
    const station
    of initStations
  ) {

    if (
      station.type
      !== "kyushu"
    ) {

      continue;
    }


    /*
     * この駅から博多までの距離。
     */
    const distanceToEnd =
      getDistanceToRouteEnd(
        kyushuCompetedRoute,
        {
          lat:
            station.lat,

          lng:
            station.lng
        }
      );


    if (
      !Number.isFinite(
        distanceToEnd
      )
    ) {

      continue;
    }


    /*
     * 九州新幹線との接続地点から
     * 当該駅までの距離。
     *
     * 接続地点→博多 全体
     * －
     * 当該駅→博多
     */
    const distanceFromConnection =
      kyushuDistance
      - distanceToEnd;


    /*
     * 接続地点と博多そのものは除く。
     */
    if (
      distanceFromConnection > 5
      &&
      distanceFromConnection
        < kyushuDistance - 5
    ) {

      stops.push(
        kyushuStartDistance
        + distanceFromConnection
      );
    }
  }


  // ========================================
  // 停車駅を距離順に並べる
  // ========================================

  stops.sort(
    (a, b) =>
      a - b
  );


  /*
   * 座標誤差等により、
   * 同じ駅がほぼ同じ位置で
   * 重複登録されることを防ぐ。
   */
  const uniqueStops =
    [];


  for (
    const distance
    of stops
  ) {

    const previous =
      uniqueStops[
        uniqueStops.length - 1
      ];


    if (
      previous === undefined
      ||
      Math.abs(
        distance - previous
      ) > 5
    ) {

      uniqueStops.push(
        distance
      );
    }
  }


  return {

    stops:
      uniqueStops,

    totalDistance,

    nishikyushuDistance,

    kyushuStartDistance,

    kyushuDistance,

    newLineDistances

  };
}


// ========================================
// 総所要時間
// ========================================

export function getTotaltime() {

  const points =
    getPoints();


  return calTotalTime(
    points
  );
}


/**
 * 長崎～博多の総所要時間を計算する。
 *
 * 「実際に停車する駅」
 * から
 * 「次に停車する駅」
 * までを1つの駅間として、
 *
 * 加速
 * ↓
 * 最高速度
 * ↓
 * 減速
 *
 * を計算する。
 *
 * 中間駅では2分停車する。
 */
export function calTotalTime(
  points
) {

  const model =
    buildTimeModel(
      points
    );


  if (!model) {

    return null;
  }


  let totalMinutes =
    0;


  for (
    let i = 0;
    i < model.stops.length - 1;
    i++
  ) {

    const segmentDistance =
      model.stops[i + 1]
      - model.stops[i];


    if (
      !Number.isFinite(
        segmentDistance
      )
      ||
      segmentDistance <= 0
    ) {

      continue;
    }


    /*
     * 駅間走行時間
     */
    totalMinutes +=
      calculateRunningTimeMinutes(
        segmentDistance
      );


    /*
     * 博多以外の中間駅では
     * 2分停車。
     */
    if (
      i + 1
      < model.stops.length - 1
    ) {

      totalMinutes +=
        DWELL_MINUTES;
    }
  }


  return Math.ceil(
    totalMinutes
  );
}


// ========================================
// 停車駅間の途中時刻
// ========================================

/**
 * ある停車駅から次の停車駅までの途中について、
 * その地点までの経過時間を求める。
 *
 * curveなどの通過点について、
 * その地点で停止したものとして計算しないために使用。
 */
function calculateElapsedTimeWithinSegment(
  distanceFromStart,
  totalSegmentDistance
) {

  if (
    !Number.isFinite(
      distanceFromStart
    )
    ||
    !Number.isFinite(
      totalSegmentDistance
    )
    ||
    totalSegmentDistance <= 0
  ) {

    return 0;
  }


  /*
   * 計算範囲を
   * 0～駅間距離に収める。
   */
  const x =
    Math.max(
      0,
      Math.min(
        distanceFromStart,
        totalSegmentDistance
      )
    );


  const accelerationDistance =
    MAX_SPEED_MPS ** 2
    /
    (
      2
      * ACCELERATION_MPS2
    );


  const decelerationDistance =
    MAX_SPEED_MPS ** 2
    /
    (
      2
      * DECELERATION_MPS2
    );


  const distanceToMaxSpeed =
    accelerationDistance
    + decelerationDistance;


  let seconds =
    0;


  // ========================================
  // 260km/hまで到達できる駅間
  // ========================================

  if (
    totalSegmentDistance
    >= distanceToMaxSpeed
  ) {

    const accelerationTime =
      MAX_SPEED_MPS
      / ACCELERATION_MPS2;


    const cruiseEndDistance =
      totalSegmentDistance
      - decelerationDistance;


    /*
     * 加速中
     */
    if (
      x <= accelerationDistance
    ) {

      seconds =
        Math.sqrt(
          2
          * x
          / ACCELERATION_MPS2
        );

    /*
     * 定速走行中
     */
    } else if (
      x <= cruiseEndDistance
    ) {

      seconds =
        accelerationTime
        +
        (
          x
          - accelerationDistance
        )
        / MAX_SPEED_MPS;

    /*
     * 減速中
     */
    } else {

      const cruiseDistance =
        cruiseEndDistance
        - accelerationDistance;


      const cruiseTime =
        cruiseDistance
        / MAX_SPEED_MPS;


      const decelerationDistanceSoFar =
        x
        - cruiseEndDistance;


      const remainingSpeedSquared =
        Math.max(
          0,
          MAX_SPEED_MPS ** 2
          -
          2
          * DECELERATION_MPS2
          * decelerationDistanceSoFar
        );


      const decelerationTime =
        (
          MAX_SPEED_MPS
          -
          Math.sqrt(
            remainingSpeedSquared
          )
        )
        / DECELERATION_MPS2;


      seconds =
        accelerationTime
        + cruiseTime
        + decelerationTime;
    }

  // ========================================
  // 260km/hまで到達しない短距離駅間
  // ========================================

  } else {

    const peakSpeed =
      Math.sqrt(
        (
          2
          * totalSegmentDistance
        )
        /
        (
          1 / ACCELERATION_MPS2
          +
          1 / DECELERATION_MPS2
        )
      );


    const accelerationDistanceToPeak =
      peakSpeed ** 2
      /
      (
        2
        * ACCELERATION_MPS2
      );


    const accelerationTimeToPeak =
      peakSpeed
      / ACCELERATION_MPS2;


    /*
     * 加速中
     */
    if (
      x <= accelerationDistanceToPeak
    ) {

      seconds =
        Math.sqrt(
          2
          * x
          / ACCELERATION_MPS2
        );

    /*
     * 減速中
     */
    } else {

      const decelerationDistanceSoFar =
        x
        - accelerationDistanceToPeak;


      const remainingSpeedSquared =
        Math.max(
          0,
          peakSpeed ** 2
          -
          2
          * DECELERATION_MPS2
          * decelerationDistanceSoFar
        );


      const decelerationTime =
        (
          peakSpeed
          -
          Math.sqrt(
            remainingSpeedSquared
          )
        )
        / DECELERATION_MPS2;


      seconds =
        accelerationTimeToPeak
        + decelerationTime;
    }
  }


  return seconds / 60;
}


// ========================================
// 各ポイントへの到着・通過時刻
// ========================================

/**
 * 新線上の指定ポイントまでの、
 * 長崎からの経過時間を返す。
 *
 * station等の場合：
 *   駅への到着時刻
 *
 * curveの場合：
 *   通過時刻
 *
 * curve地点では停止せず、
 * 前後の実停車駅間の速度曲線上で計算する。
 */
function arrivalAtDistance(model, targetDistance) {
  if (targetDistance <= 5) return 0;
  let elapsed = 0;
  for (let i = 0; i < model.stops.length - 1; i++) {
    const start = model.stops[i], end = model.stops[i + 1];
    if (targetDistance < end - 5) {
      return elapsed + calculateElapsedTimeWithinSegment(Math.max(0, targetDistance - start), end - start);
    }
    elapsed += calculateRunningTimeMinutes(end - start);
    if (targetDistance <= end + 5) return elapsed;
    if (i + 1 < model.stops.length - 1) elapsed += DWELL_MINUTES;
  }
  return elapsed;
}

export function calEachStationTime(points, pointsNum) {
  const model = buildTimeModel(points);
  if (!model || !Number.isInteger(pointsNum) || pointsNum < 0 || pointsNum >= points.length) return null;
  return arrivalAtDistance(model, model.nishikyushuDistance + model.newLineDistances[pointsNum]);
}

// 総所要時間と同じ停車駅・加減速・停車時間を使う、長崎からの到着経過時間。
export function getStationTimetable(points) {
  const model = buildTimeModel(points);
  if (!model) return [];
  const entries = points.flatMap((point, index) => point.type === 'curve' ? [] : [{
    name: point.name, lat: point.latlng.lat, lng: point.latlng.lng, point,
    distance: model.nishikyushuDistance + model.newLineDistances[index]
  }]);
  for (const station of getInitStations() || []) {
    let distance;
    if (station.type === 'nishikyushu') {
      distance = getDistanceToRouteEnd(nishikyushuCompetedRoute, station);
      if (distance > model.nishikyushuDistance + 5) continue;
    } else if (station.type === 'kyushu' || station.type === 'hakata') {
      const toEnd = getDistanceToRouteEnd(kyushuCompetedRoute, station);
      if (toEnd > model.kyushuDistance + 5) continue;
      distance = model.totalDistance - toEnd;
    } else continue;
    if (Number.isFinite(distance)) entries.push({ ...station, distance });
  }
  entries.sort((a,b) => a.distance - b.distance || Number(!!b.point) - Number(!!a.point));
  const unique=[];
  for (const entry of entries) {
    const previous=unique[unique.length-1];
    if (previous && Math.abs(previous.distance-entry.distance)<=5) {
      if(entry.point) unique[unique.length-1]=entry;
    } else unique.push(entry);
  }
  return unique.map(entry => ({ ...entry, arrivalMinutes: arrivalAtDistance(model, entry.distance) }));
}

// ========================================
// 表示用
// ========================================

/**
 * ○分を
 * HH:MM形式へ変換する。
 */
export function formatTime(
  totalMinutes
) {

  if (
    !Number.isFinite(
      totalMinutes
    )
  ) {

    return '--:--';
  }


  const hours =
    Math.floor(
      totalMinutes / 60
    );


  const minutes =
    Math.floor(
      totalMinutes % 60
    );


  return (
    `${String(hours).padStart(2, '0')}`
    +
    ':'
    +
    `${String(minutes).padStart(2, '0')}`
  );
}