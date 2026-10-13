import * as SunCalc from 'suncalc';

const LATITUDE = 30.12847;
const LONGITUDE = 118.16292;
const beijingTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
});
const clamp = (value) => Math.max(0, Math.min(1, value));

export function getLightingForDate(date, latitude = LATITUDE, longitude = LONGITUDE) {
  const sun = SunCalc.getPosition(date, latitude, longitude);
  const moon = SunCalc.getMoonPosition(date, latitude, longitude);
  const moonFraction = SunCalc.getMoonIllumination(date).fraction;
  const daylight = clamp((sun.altitude + 4) / 16);
  const twilight = clamp(1 - Math.abs(sun.altitude - 4) / 22);
  const moonlight = clamp(moon.altitude / 12) * moonFraction * (1 - daylight);
  const morning = sun.azimuth < 180;
  const period = sun.altitude >= 25 ? '日光' : sun.altitude >= -6
    ? (morning ? '晨光' : '暮光') : moonlight > 0.08 ? '月光' : '夜色';

  return { sun, moon, daylight, twilight, moonlight, period, time: beijingTime.format(date) };
}

export function skyDirection({ altitude, azimuth }) {
  const elevation = altitude * Math.PI / 180;
  const bearing = azimuth * Math.PI / 180;
  return [Math.sin(bearing) * Math.cos(elevation), Math.sin(elevation), -Math.cos(bearing) * Math.cos(elevation)];
}
