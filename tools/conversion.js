const fs = require("fs");
const path = require("path");

const files = [
  "../raw_data/L03-b-21_4929.geojson",
  "../raw_data/L03-b-21_4930.geojson",
  "../raw_data/L03-b-21_5029.geojson",
  "../raw_data/L03-b-21_5030.geojson"
].map(f => path.join(__dirname, f));
console.log(files)
const output = path.join(
  __dirname,
  "../data/landuse.json"
);
let geojson=[]
for (const file of files) {
  geojson.push ( JSON.parse(fs.readFileSync(file, "utf8")));
};

const result = {};
for (const g of geojson) {
  for (const feature of g.features) {
    const mesh = feature.properties["細分メッシュコード"];
    const landuse = feature.properties["土地利用種別"];

    result[mesh] = landuse;
  }
}
fs.writeFileSync(
  output,
  JSON.stringify(result)
);

console.log("変換完了");