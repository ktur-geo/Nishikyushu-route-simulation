'use strict'

var spots = []
var spots_flatlatlngs = []
var Takeoonsen_latLng = {lat:33.19633114711281, lng:130.0230646133423}
var Takeoonsen_flat_latLng = [22197.37244784599, -91088.79738153054]
var Shintosu_latLng = {lat:33.369602958, lng:130.4916572}
var Shintosu_flat_latLng = [41103.158754129894, -47303.26201167537]
var num = 2
//経由するルートを書く。[0,3,2,1]的な感じで
var routes = []
//地理メッシュごとの情報を入れる。　案、[座標、]
//地理メッシュの人口データの読み込み
let meshData = [];
fetch('/data/population-mesh.json')
  .then(res => res.json())
  .then(data => { meshData = data; })
  .catch(err => console.error(err));


function calTime(distance) {
  var time = 0.0 //単位は分
  //武雄温泉→新鳥栖の所要時間を求める。加速度 2.6km/h/s 減速度2.7km/h/s 最高速260kmより
  //一駅当たり加減速時間2分、停車時間2分追加
  if (distance > 7000) { time = (distance / 260 / 1000) * 60 + 4 }
  else {
    //距離七km以下
    time = (distance / 2.6 / 1000) ^ (0.5) / 60
  }
  //長崎→武雄温泉間 最速23分、新鳥栖→博多間　最速13分

  return time
}

//単位はメートル
function calDistance(latlng1, latlng2) {
  var distance = 0.0
  distance = ((latlng1[0] - latlng2[0]) ** 2 + (latlng1[1] - latlng2[1]) ** 2) ** (0.5)
  return distance
}

//ここ未了、ルートを加えた処理をする
function cal_sum_time(spots_flatlatlngs) {
  //長崎→武雄温泉間 最速23分、新鳥栖→博多間　最速13分
  var sumtime = 0
  for (var i = 0; i < spots_flatlatlngs.length - 1; i++) {
    var distance = calDistance(spots_flatlatlngs[i].latlng, spots_flatlatlngs[i + 1].latlng)
    console.log(distance)
    sumtime += calTime(distance)
    console.log(sumtime)
  }
  return sumtime
}
//長崎→武雄温泉間 最速23分、新鳥栖→博多間　最速13分を足す関数。
function add_competed_time(time) {
  return time + 23 + 13
}


function init() {
  function makeMiniTimetable(time1, time2) {
    var table = L.control({ position: 'bottomright' });
    table.onAdd = function (map) {
      //domutil ドメインユーティリティ
      var div = L.DomUtil.create('div', 'arrival-timetable')
      div.innerHTML += "<h4>長崎→博多</h4>"
      div.innerHTML += "<h4>" + time1 + "分</h4>"
      div.innerHTML += "<h4>新駅→博多</h4>"
      div.innerHTML += "<h4>" + time2 + "分</h4>"
      return div;
    }
    table.addTo(map);
  }


  var west_competed_latlngs =
    [[33.19633114711281, 130.0230646133423],
    [33.18737974002031, 130.00941753387454],
    [33.16219956476521, 129.99572753906253],
    [33.1518344385804, 129.99360322952273],
    [33.1300762652106, 129.99332427978518],
    [33.10922935660631, 129.99898910522464],
    [33.09858833774286, 129.9983024597168],
    [33.08578864901153, 129.99195098876956],
    [33.06248555690915, 129.96259689331058],
    [33.05586750447235, 129.95727539062503],
    [33.039032390053734, 129.95195388793948],
    [33.01067881643441, 129.95967864990237],
    [32.99124343682642, 129.9584770202637],
    [32.97165976290337, 129.94766235351565],
    [32.96100211570805, 129.94594573974612],
    [32.951495561903016, 129.94766235351565],
    [32.92894941952641, 129.95933532714847],
    [32.923618181543894, 129.9602794647217],
    [32.91936736975366, 129.96276855468753],
    [32.899623635855626, 129.98345375061038],
    [32.896308562782686, 129.9888610839844],
    [32.89342578969234, 129.99504089355472],
    [32.88528144887579, 130.01581192016604],
    [32.87619926578112, 130.02980232238772],
    [32.868774250201874, 130.03563880920413],
    [32.851254516662905, 130.04138946533206],
    [32.848153956580234, 130.04160404205325],
    [32.845810438122086, 130.04100322723392],
    [32.84188039904022, 130.03688335418704],
    [32.83903191332702, 130.03409385681155],
    [32.8263388154504, 130.02490997314456],
    [32.816926000469806, 130.01400947570804],
    [32.79542786429793, 129.97263908386233],
    [32.79174813202901, 129.96354103088382],
    [32.78965566734315, 129.9529838562012],
    [32.786697271201156, 129.90963935852054],
    [32.78532627377066, 129.9017429351807],
    [32.781573962226545, 129.89127159118655],
    [32.77536786890293, 129.88260269165042],
    [32.766996173649815, 129.87453460693362],
    [32.758046249391626, 129.86929893493655],
    [32.75176633003113, 129.86921310424808]
    ]
  var east_competed_latlngs = [
    [33.36958503840807, 130.49168407917026],
    [33.42040967181813, 130.45260429382327],
    [33.43280228784497, 130.4466819763184],
    [33.444978279412204, 130.44436454772952],
    [33.462379817843576, 130.44470787048343],
    [33.479706274098, 130.448055267334],
    [33.48894086202684, 130.44676780700686],
    [33.503613956705365, 130.44067382812503],
    [33.53223722395908, 130.43243408203128],
    [33.53781765748047, 130.4326915740967],
    [33.554270684604866, 130.43655395507815],
    [33.559420553582584, 130.43655395507815],
    [33.56700174635298, 130.43303489685061],
    [33.57780022060551, 130.42239189147952],
    [33.5815900932834, 130.4205894470215],
    [33.58938383661381, 130.42067527771]
  ]


  //L.control.scale({ maxWidth: 200, position: 'bottomright', imperial: false }).addTo(map);
  //L.control.mousePosition().addTo(map);
  //地図を表示するdiv要素のidを設定
  var map = L.map('map', { zoomControl: false }).setView([33.3, 130.3], 10);
  //地図の中心とズームレベルを指定
  //表示するタイルレイヤのURLとAttributionコントロールの記述を設定して、地図に追加する
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: "&copy;<a href='https://openstreetmap.jp' target='_blank'>openstreetmap</a>"
  }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  //線をしましまのものに変更する 済　作成できたがいちいち書くのはコードとして面倒。関数にする？
  var constructionLine = L.layerGroup({ interactive: true })

  var east_competed_Line = L.layerGroup();
  var west_competed_Line = L.layerGroup();
  makeLine(east_competed_Line, east_competed_latlngs)
  makeLine(west_competed_Line, west_competed_latlngs)

  //lineは関数 ax+by+c=0を用いる
  function calDistancePointAndLine(point1, line_function) {
    let distance = Math.abs(point1[0] * line_function.a + point1[1] * line_function.b + line_function.c)
      / Math.cbrt(Math.pow(line_function.a, 2) + Math.pow(line_function.b, 2))
    return distance
  }
  //ここで線を関数に変更。ここの関数名を変更
  function linkConbersionFunction(coordinate1,coordinate2){
    if (coordinate1[0] !=coordinate2[0]){
      let tilt = (coordinate1[1] -coordinate2[1])/(coordinate1[0] -coordinate2[0])
      let intercept = coordinate1[1]-coordinate1[0] *tilt
      return {a:tilt,b:-1,c:intercept};
    }else{
      return {a:1,b:0,c:-coordinate1[0]}
    }
  }
  //ここにある点から半径dあたりの人口を出力する関数。
  function getPopulationWithinRadius(Lat, Lng, d, meshData) {
    const EARTH_RADIUS = 6371; // 地球半径 (km)
    function haversine(lat1, lng1, lat2, lng2) {
      const toRad = angle => angle * Math.PI / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
  }
  console.log(meshData)
  const spots = meshData.filter(mesh => {
    const dist = haversine(Lat, Lng, mesh.lat, mesh.lng);
    return dist <= d;
  });

  const totalPopulation = spots.reduce((sum, mesh) => sum + mesh.population, 0);

  return {
    spots,
    totalPopulation
  };
  }

  function addAct(name) {
    name.on("click", function (ev) {
      console.log(ev)
      spots.push({ latlng: ev.latlng, attribute: "station", marker: "" });
      spots[spots.length - 1].marker = makeMarker(ev.latlng, spots.length - 1);
      var xy = translate_latlng_coord(num, ev.latlng.lat, ev.latlng.lng);
      console.log(xy);
      spots_flatlatlngs.push({ latlng: xy, attribute: "station" });
      //どこの間の線か確認する関数
      let click_route = -1
      let distance=10000
      for (let i = 0; i < routes.length-1; i++) {
        //点と直線の距離を図る。(終点ークリックした点)×(クリックした点ー始点)＞＝0かを判断する。
        if((spots_flatlatlngs[routes[i]].latlng[0]-xy[0])*(-spots_flatlatlngs[routes[i+1]].latlng[0]+xy[0])>=0){
                  //点と直線の距離を測る関数を実装
          let line_function=linkConbersionFunction(spots_flatlatlngs[routes[i]].latlng,spots_flatlatlngs[routes[i+1]].latlng)
          let new_distance =calDistancePointAndLine(xy,line_function)
          if(distance>new_distance){
            distance=new_distance
            click_route= i
            console.log("aaerwea")
          }

        }
        //クリックしたルートがわかったら挿入する

        }
        if(click_route>=0){
          routes.splice(click_route+1,0,spots.length-1)
      }
      console.log(routes)
      console.log(spots);
    });
  }
  function makeLine(groupName, latlngs) {

    var polyline1 = L.polyline(latlngs, { weight: 6, color: "rgb(0,0,0)", interactive: true });
    var polyline2 = L.polyline(latlngs, { color: "rgb(230,60,60)", interactive: true });
    var polyline3 = L.polyline(latlngs, { dashArray: "8", lineCap: "butt", color: "rgb(255,230,230)", interactive: true });
    addAct(polyline1)
    addAct(polyline2)
    addAct(polyline3)


    groupName.addLayer(polyline1);
    groupName.addLayer(polyline2);
    groupName.addLayer(polyline3);

    groupName.addTo(map);
  }
  function makeLine2(groupName, spots, route) {
    //改良　routeも含み、route順に配列を取っていく処理
    var latlngs_route = []
    for (let i = 0; i < route.length; i++) {
      console.log(route[i])
      latlngs_route.push(spots[route[i]].latlng)

    }
    console.log(latlngs_route)
    var polyline1 = L.polyline(latlngs_route, { weight: 6, color: "rgb(0,0,0)", interactive: true });
    var polyline2 = L.polyline(latlngs_route, { color: "rgb(230,60,60)", interactive: true });
    var polyline3 = L.polyline(latlngs_route, { dashArray: "8", lineCap: "butt", color: "rgb(255,230,230)", interactive: true });
    addAct(polyline1)
    addAct(polyline2)
    addAct(polyline3)


    groupName.addLayer(polyline1);
    groupName.addLayer(polyline2);
    groupName.addLayer(polyline3);

    groupName.addTo(map);
  }

  var stationMarker = L.divIcon({ className: "station" })
  var miniStationMarker = L.divIcon({ className: "ministation" })
  //ポップがダサい、表示の仕方を変える。マーカーで画像化する？

  var startpop = L.popup()
    .setLatLng(Takeoonsen_latLng)
    .setContent("武雄温泉駅")
    .openOn(map)

  var goalpop = L.popup()
    .setLatLng(Shintosu_latLng)
    .setContent("新鳥栖駅")
    .addTo(map)

  var startCircle = L.marker(Takeoonsen_latLng, { icon: stationMarker }).addTo(map);
  var goalCircle = L.marker(Shintosu_latLng, { icon: stationMarker }).addTo(map);
  var mode = "firstClick";

  //右下に時間を掲載する。　右下にするもの→ここを関数化して、

  //右上にアラートを掲載する
  var alert = L.control({ position: 'topleft' });
  alert.onAdd = function (map) {
    //domutil ドメインユーティリティ

    var div = L.DomUtil.create('div', 'alert')
    div.innerHTML += "<h4>駅を置きたい場所をクリックしてください</h4>"
    div.innerHTML += "<h6>西九州新幹線のオリジナルルート案を作成できます。</h6>"
    return div;
  };
  alert.addTo(map)
  //アラートの文字を変える処理。
  function changeAlert() {
    map.removeControl(alert)
    alert = L.control({ position: 'topleft' });
    alert.onAdd = function (map) {
      //domutil ドメインユーティリティ
      var div = L.DomUtil.create('div', 'alert')
      div.innerHTML += "<h4>右下にオリジナルルート概要表示中です</h4>"
      div.innerHTML += "<h6>線路・駅をドラッグして追加編集できます。(操作方法)</h6>"
      return div;
    };
    alert.addTo(map)
  }


  //広がるようにマーカーを作る挙動。
  function makeMarker(latlng, numA) {
    console.log(latlng)
    var B = L.marker(latlng, { icon: stationMarker, draggable: true }).addTo(map)
      //ドラッグ中のイベントの記載
      .on('dragstart', function (event) {
        console.log('Drag Start');
      }).on("dragend", function (ev) {
        //stationの座標を動かす処理を書く。座標の取得○。何を動かしたかを取得
        console.log(ev.target._latlng)
        //ドラッグドロップした位置に座標を入れ替える処理
        spots[numA].latlng = ev.target._latlng
        spots_flatlatlngs[numA].latlng = translate_latlng_coord(num, ev.target._latlng.lat, ev.target._latlng.lng)

        //makelineにもともとの線を消す処理。　ドラッグドロップした位置に線を移動させる処理。
        map.removeLayer(constructionLine);
        constructionLine = L.layerGroup()
        makeLine2(constructionLine, spots, routes)
      })
      .on("click", function (event) {
        console.log(event)
        console.log("クリック")

        if (spots[numA].attribute === "station") {
          spots[numA].attribute = "mini_station"
          spots[numA].marker.getElement().classList.remove('station')
          spots[numA].marker.getElement().classList.add('ministation')


        } else if (spots[numA].attribute === "curve") {
          spots[numA].attribute = "station"
          spots[numA].marker.getElement().classList.remove('curve')
          spots[numA].marker.getElement().classList.add('station')
        } else if (spots[numA].attribute === "mini_station") {
          spots[numA].attribute = "curve"
          spots[numA].marker.getElement().classList.remove('ministation')
          spots[numA].marker.getElement().classList.add('curve')
        }
        console.log(spots)

        //ここでアイコンのクラスを変える

      })
    return B
  }



  spots.push({ latlng: Takeoonsen_latLng, attribute: "start_station", marker: "" })
  spots_flatlatlngs.push({ latlng: Takeoonsen_flat_latLng, attribute: "start_station" })
  spots.push({ latlng: Shintosu_latLng, attribute: "goal_station" })
  spots_flatlatlngs.push({ latlng: Shintosu_flat_latLng, attribute: "goal_station" })


  map.on('click', function (ev) {
    if (mode == "station") {
      //ここの改良。線を触ったら駅を追加するようにする。マップを触っても何も起きないように
      /*
      console.log(ev)
      latlngs.push(ev.latlng)
     makeLine(constructionLine,latlngs)
     spots.push({latlng:ev.latlng,attribute:"station"})
     var xy=translate_latlng_coord(num,ev.latlng.lat,ev.latlng.lng)
     spots_flatlatlngs.push({latlng:xy,attribute:"station"})
     spots[spots.length-1].marker=makeMarker(ev.latlng,spots.length-1)

      console.log(spots)
      */
    }
    if (mode == "firstClick") {
      console.log(ev)

      spots.push({ latlng: ev.latlng, attribute: "station", marker: "" })
      spots[spots.length - 1].marker = makeMarker(ev.latlng, spots.length - 1)
      var xy = translate_latlng_coord(num, ev.latlng.lat, ev.latlng.lng)
      spots_flatlatlngs.push({ latlng: xy, attribute: "station" })
      routes = [0, 2, 1]
      makeLine2(constructionLine, spots, routes);
      mode = "station"
      console.log(spots);
      var sumtime = cal_sum_time(spots_flatlatlngs)
      console.log(sumtime)
      makeMiniTimetable(add_competed_time(sumtime), 0)
      changeAlert()
      console.log(spots)
      var stpop = getPopulationWithinRadius(spots[2].latlng.lat,spots[2].latlng.lng,10,meshData)
      console.log(stpop)

      getElevationsAlongPoints(spots.map(s => s.latlng)).then(result => {
        console.log("標高付きスポット一覧:", result);
      });
      drawElevationProfileFromSpots(spots);
    }
  });
}

//線分から標高を算出する関数　chatgpt作成
function haversineDistance(latlng1, latlng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(latlng2.lat - latlng1.lat);
  const dLng = toRad(latlng2.lng - latlng1.lng);

  const lat1 = toRad(latlng1.lat);
  const lat2 = toRad(latlng2.lat);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// 線形を50mごとに分割
function samplePolyline(polyline, intervalMeters = 50) {
  const latlngs = polyline.getLatLngs();
  const sampledPoints = [];

  for (let i = 0; i < latlngs.length - 1; i++) {
    const start = latlngs[i];
    const end = latlngs[i + 1];
    const dist = haversineDistance(start, end);
    const steps = Math.floor(dist / intervalMeters);

    for (let j = 0; j <= steps; j++) {
      const ratio = j / steps;
      const lat = start.lat + (end.lat - start.lat) * ratio;
      const lng = start.lng + (end.lng - start.lng) * ratio;
      sampledPoints.push({ lat, lng });
    }
  }

  return sampledPoints;
}

// 標高タイルから標高を取得（地理院タイル PNG → 標高値に変換）
async function getElevation(lat, lng) {
  const zoom = 15;
  const tileSize = 256;

  const { pixelX, pixelY } = latLngToPixel(lat, lng, zoom);
  const tileX = Math.floor(pixelX / tileSize);
  const tileY = Math.floor(pixelY / tileSize);
  const px = Math.floor(pixelX % tileSize);
  const py = Math.floor(pixelY % tileSize);

  const tileUrl = `https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/${zoom}/${tileX}/${tileY}.png`;

  const img = new Image();
  img.crossOrigin = "Anonymous";

  return new Promise((resolve, reject) => {
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = tileSize;
      canvas.height = tileSize;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(px, py, 1, 1).data;
      const [R, G, B] = data;

      let height = R * (2 ** 16) + G * (2 ** 8) + B;
      if (height < 2 ** 23) {
        height *= 0.01;
      } else if (height === 2 ** 23) {
        height = 0; // No data
      } else {
        height = (height - 2 ** 24) * 0.01;
      }

      resolve(height);
    };

    img.onerror = reject;
    img.src = tileUrl;
  });
}

function latLngToPixel(lat, lng, zoom, tileSize = 256) {
  const sinLat = Math.sin(lat * Math.PI / 180);
  const x = ((lng + 180) / 360) * (2 ** zoom) * tileSize;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * (2 ** zoom) * tileSize;

  return { pixelX: x, pixelY: y };
}

// 線形上の標高を全て取得
async function getElevationsAlongPoints(spots, intervalMeters = 250) {
  const sampledPoints = [];

  // スポット間を線形として扱い、250mごとに分割
  for (let i = 0; i < spots.length - 1; i++) {
    const start = spots[i];
    const end = spots[i + 1];
    const dist = haversineDistance(start, end);
    const steps = Math.floor(dist / intervalMeters);

    for (let j = 0; j <= steps; j++) {
      const ratio = j / steps;
      const lat = start.lat + (end.lat - start.lat) * ratio;
      const lng = start.lng + (end.lng - start.lng) * ratio;
      sampledPoints.push({ lat, lng });
    }
  }

  // 標高取得
  const results = [];
  for (const pt of sampledPoints) {
    try {
      const elevation = await getElevation(pt.lat, pt.lng);
      results.push({ ...pt, elevation });
    } catch (e) {
      results.push({ ...pt, elevation: null });
    }
  }

  return results;
}
//線から一定間隔ごとの標高を出す関数
async function getElevationsAlongPolyline(latlngs, interval = 50) {
  const sampledPoints = [];

  function toRadians(deg) {
    return deg * Math.PI / 180;
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球の半径（m）
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLng/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function interpolate(lat1, lng1, lat2, lng2, fraction) {
    return [
      lat1 + (lat2 - lat1) * fraction,
      lng1 + (lng2 - lng1) * fraction
    ];
  }

  // 線を分割してサンプリング
  for (let i = 0; i < latlngs.length - 1; i++) {
    const [lat1, lng1] = [latlngs[i].lat, latlngs[i].lng];
    const [lat2, lng2] = [latlngs[i + 1].lat, latlngs[i + 1].lng];
    const segmentLength = haversine(lat1, lng1, lat2, lng2);
    const numSamples = Math.floor(segmentLength / interval);

    for (let j = 0; j <= numSamples; j++) {
      const f = j / numSamples;
      const [lat, lng] = interpolate(lat1, lng1, lat2, lng2, f);
      sampledPoints.push([lat, lng]);
    }
  }

  // 標高を取得（順次await）
  const elevationData = [];
  for (const [lat, lng] of sampledPoints) {
    const height = await getElevation(lat, lng);
    elevationData.push({ lat, lng, height });
  }

  return elevationData;
}

//chatGpt作成
async function drawElevationProfileFromSpots(spots) {
  const interval = 50; // mごとに標高を取得
  const elevationPoints = await getElevationsAlongPolyline(spots.map(s => s.latlng), interval);

  const labels = elevationPoints.map((pt, i) => (i * interval / 1000).toFixed(2)); // km
  const data = elevationPoints.map(pt => pt.height);

  const ctx = document.getElementById('elevationChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '標高プロファイル',
        data: data,
        borderColor: 'rgb(75, 192, 192)',
        fill: false,
        pointRadius: 0,
        tension: 0.1
      }]
    },
    options: {
      scales: {
        x: {
          title: {
            display: true,
            text: '距離 (km)'
          }
        },
        y: {
          title: {
            display: true,
            text: '標高 (m)'
          }
        }
      },
      responsive: true
    }
  });
}

//路線の時間を図るシステム、西九州新幹線の

//変換をするシステム、元論文のJSをもとに作成
