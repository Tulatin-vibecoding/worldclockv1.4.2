/**
 * 将 ne_50m_land.shp 转为 GeoJSON，并预计算城市三维坐标
 * 用法: node scripts/convert-for-3d.js
 */
const fs = require('fs');
const path = require('path');
const shp = require('shapefile');

const SHP_PATH = path.join(__dirname, '..', 'ne_50m_land', 'ne_50m_land.shp');
const GEOJSON_OUT = path.join(__dirname, '..', 'data', 'ne_50m_land.geojson');
const COORDS3D_OUT = path.join(__dirname, '..', 'data', 'city-3d-coords.json');

const R = 2.005; // 球体表面元素半径

function latLngTo3D(lat, lng, radius) {
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  return {
    x: radius * Math.cos(latRad) * Math.cos(lngRad),
    y: radius * Math.sin(latRad),
    z: -radius * Math.cos(latRad) * Math.sin(lngRad)
  };
}

async function main() {
  // ========== Step 1: SHP → GeoJSON ==========
  console.log('Reading shapefile...');
  const geojson = await shp.read(SHP_PATH);
  
  // 精简：只保留 geometry，删除属性
  const simplified = {
    type: 'FeatureCollection',
    features: geojson.features ? geojson.features.map(f => ({
      type: 'Feature',
      geometry: f.geometry
    })) : []
  };
  
  fs.writeFileSync(GEOJSON_OUT, JSON.stringify(simplified));
  const kb = (fs.statSync(GEOJSON_OUT).size / 1024).toFixed(1);
  console.log(`✅ GeoJSON → data/ne_50m_land.geojson (${kb} KB)`);

  // ========== Step 2: 城市三维坐标 ==========
  const citiesJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cities.js'), 'utf-8');
  const citiesMatch = citiesJs.match(/CITIES\s*=\s*(\[[\s\S]*?\]);/);
  if (!citiesMatch) { console.error('无法解析城市数据'); process.exit(1); }
  const cities = eval(citiesMatch[1]);
  
  const coords3D = {};
  cities.forEach(c => {
    coords3D[c.name] = latLngTo3D(c.lat, c.lon, R);
  });
  
  fs.writeFileSync(COORDS3D_OUT, JSON.stringify(coords3D));
  console.log(`✅ 城市 3D 坐标 → data/city-3d-coords.json (${Object.keys(coords3D).length} 个城市)`);
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
