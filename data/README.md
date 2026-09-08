# 同梱データの出典・加工内容

本サイトは非公式のシミュレーションです。配布元の原データと、本サイトの加工結果を区別してください。数値は地域や政策の価値、実際の事業費・需要・施工可能性を示しません。

|ファイル|出典・対象|加工|
|---|---|---|
|population-mesh.json|総務省・令和2年国勢調査、e-Statの500mメッシュ人口|対象地域を抽出し、メッシュ座標と人口をJSON化。集計は各メッシュ中心の距離を使用|
|landuse.json|国土交通省・国土数値情報 土地利用細分メッシュ（2021年度）|メッシュコードと土地利用種別を抽出・統合|
|municipalities.json|国土交通省・国土数値情報 行政区域（2020年）、JapanCityGeoJsonのGeoJSON変換版|福岡・佐賀・長崎・熊本の162市区町村の境界を約10mの許容差で簡略化、座標丸め。地点の概略判定用|
|share-geography.json|上記の行政区域データ、Natural Earth 1:10m Admin 0 Countries（国外の陸地のみ）|北部九州周辺の共有画像用背景。市区町村の同じ座標で陸地と境界を描画。周辺8県（島根・広島・山口・愛媛・高知・大分・宮崎・鹿児島）はJapanCityGeoJsonの県別行政区域を使用。約40mの許容差で簡略化。道路・地形詳細は含まない概略図|
|nishikyushu-competed-route.json / kyushu-competed-route.json / init-stations.json|OpenStreetMapを参照した既存線位置・駅位置|シミュレーション用の概略折れ線・駅一覧|
|nishikyushu-existing-track-profile-approx.json|JRTT「西九州新幹線の概要」|縦断図をデジタイズした概略線路標高。詳細はJSON内sources・accuracy_noteを参照|
|kyushu-existing-track-profile-approx-v2.json|JRTT委員会資料、SAGACAT資料|既存線の概略標高。詳細はJSON内sourcesを参照|
|existing-track-terrain-100m.json|国土地理院の標高タイル|既存線の約100m間隔の地表標高を抽出|
|tourist-spots.json|サイト制作者による観光地点・ランク設定|実際の観光客数や公的な格付けではない独自の比較用指標|

## 公開元・利用条件

- [Natural Earthの利用条件](https://www.naturalearthdata.com/about/terms-of-use/)：パブリックドメイン。[配布元のGeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson)から加工しています。共有用背景の再生成は `node tools/build-share-geography.mjs`。

- [e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)：出典・加工を明示。数値等の著作権対象外情報と、保護されるコンテンツを区別。
- [土地利用細分メッシュ（2021年度）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-b-2021.html)：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)。本サイトで抽出・変換したものです。
- [行政区域（2020年）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html)：2018年以降はオープンデータ。[国土数値情報利用規約](https://nlftp.mlit.go.jp/ksj/other/agreement_01.html)に基づく。形式変換元は[niiyz/JapanCityGeoJson](https://github.com/niiyz/JapanCityGeoJson)。原典・二次利用の条件も公開元に従ってください。概略判定用で、測量・行政境界の確定・権利確認には使用しません。
- [OpenStreetMapの著作権・ライセンス](https://www.openstreetmap.org/copyright)：© OpenStreetMap contributors、[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。データの再利用条件とアプリのプログラムの条件は別です。
- [国土地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)：本サイトの標高断面図等は、国土地理院のデータを加工して作成したものです。原典の測量成果・タイル固有の利用条件に従ってください。
- [JRTT利用規約](https://www.jrtt.go.jp/terms-of-use.html)、[西九州新幹線の概要](https://www.jrtt.go.jp/project/Nishikyushu_shinkansen_outline.pdf)、[九州新幹線の資料](https://www.jrtt.go.jp/construction/committee/asset/jk27-06-2.pdf)、[SAGACAT資料](https://www.sagacat.or.jp/pdf/21-2_sagacat_y.pdf)。加工した概略値であり、各機関の公式な線路設計データではありません。第三者が権利を持つ図版等の再利用は個別条件の確認が必要です。

市区町村データの再生成：プロジェクトのルートで `node tools/build-municipalities.mjs`。元データの変更により結果が変わる可能性があります。更新時は基準点での判定を再確認してください。
