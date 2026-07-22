/**
 * GeoJSON → TopoJSON 转换（含量化压缩）
 */
const fs = require('fs');
const topojson = require('topojson-server');

const input = 'data/ne_50m_land.geojson';
const output = 'data/ne_50m_land.topojson';

const geojson = JSON.parse(fs.readFileSync(input, 'utf8'));

// 创建一个 FeatureCollection 的 topology
// 使用量化减少坐标精度（1e4 量级足够球面显示）
const topo = topojson.topology({ land: geojson }, 1e4);

const origSize = fs.statSync(input).size;
const topoSize = JSON.stringify(topo).length;

console.log('GeoJSON:', (origSize / 1024 / 1024).toFixed(2), 'MB');
console.log('TopoJSON:', (topoSize / 1024).toFixed(1), 'KB');
console.log('节省:', ((1 - topoSize / origSize) * 100).toFixed(0), '%');

fs.writeFileSync(output, JSON.stringify(topo));
console.log('Saved to', output);
