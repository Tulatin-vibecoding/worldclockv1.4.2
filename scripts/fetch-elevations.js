#!/usr/bin/env node
/**
 * fetch-elevations.js — 从 GeoNames API 批量获取城市海拔
 * 用法: node scripts/fetch-elevations.js <geonames_username>
 * 需要注册免费 GeoNames 账号: https://www.geonames.org/login
 * 输出: data/elevations.json
 */
const fs = require('fs');
const path = require('path');

const USERNAME = process.argv[2];
if (!USERNAME) {
  console.error('用法: node fetch-elevations.js <geonames_username>');
  console.error('请先注册 https://www.geonames.org/login');
  process.exit(1);
}

// 读取城市数据
const citiesPath = path.join(__dirname, '..', 'js', 'cities.js');
const citiesText = fs.readFileSync(citiesPath, 'utf8');

// 提取城市名和坐标
const cityRegex = /name:"([^"]+)".*name_en:"([^"]+)".*lat:([-\d.]+),\s*lon:([-\d.]+)/g;
const cities = [];
let match;
while ((match = cityRegex.exec(citiesText)) !== null) {
  cities.push({ name: match[1], name_en: match[2], lat: parseFloat(match[3]), lon: parseFloat(match[4]) });
}

console.log(`找到 ${cities.length} 个城市，开始获取海拔...\n`);

async function fetchElevation(city) {
  const url = `https://api.geonames.org/srtm3JSON?lat=${city.lat}&lng=${city.lon}&username=${USERNAME}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.srtm3 !== undefined && data.srtm3 !== -32768) {
      return Math.round(data.srtm3);
    }
    // fallback to astergdem
    const url2 = `https://api.geonames.org/astergdemJSON?lat=${city.lat}&lng=${city.lon}&username=${USERNAME}`;
    const resp2 = await fetch(url2);
    const data2 = await resp2.json();
    if (data2.astergdem !== undefined && data2.astergdem !== -32768) {
      return Math.round(data2.astergdem);
    }
  } catch (e) {
    console.error(`  ${city.name}: 请求失败 - ${e.message}`);
  }
  return null;
}

async function main() {
  const elevations = {};
  let count = 0;

  for (const city of cities) {
    const elev = await fetchElevation(city);
    if (elev !== null) {
      elevations[city.name] = elev;
      console.log(`  ✅ ${city.name}: ${elev}m`);
    } else {
      elevations[city.name] = null;
      console.log(`  ⚠️  ${city.name}: 无数据`);
    }
    count++;
    // API 限流：每天 2000 次免费请求
    if (count % 20 === 0) {
      console.log(`  等待 1 秒 (限流)...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const outPath = path.join(__dirname, '..', 'data', 'elevations.json');
  fs.writeFileSync(outPath, JSON.stringify(elevations, null, 2));
  const found = Object.values(elevations).filter(v => v !== null).length;
  console.log(`\n完成: ${found}/${cities.length} 个城市已有海拔数据`);
  console.log(`输出: ${outPath}`);
}

main().catch(console.error);
