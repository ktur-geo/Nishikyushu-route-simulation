import { getPoints, renamePoint, isRouteReadOnly } from './points.js';
import { getPopulationWithinRadius } from './population.js';
import { getStationTimetable, formatTime } from './time.js';
import { MAX_STATION_NAME_LENGTH } from './route-data.js';

export function updateStationList() {
  const list = document.getElementById('station-list');
  if (!list) return;
  list.replaceChildren();
  const editToggle = document.getElementById('edit-toggle');
  const editing = editToggle.checked && !isRouteReadOnly();
  editToggle.disabled = isRouteReadOnly();
  document.body.classList.toggle('edit-mode', editing);
  const header = document.createElement('li');
  header.className = 'station-row';
  for (const [label, className] of [['駅名', 'station-name'], ['半径5km人口', 'station-pop'], ['経過時間', 'station-time']]) {
    const cell = document.createElement('span'); cell.textContent = label; cell.className = className; header.appendChild(cell);
  }
  header.title = '長崎出発から各駅到着までの経過時間（実際のダイヤではありません）';
  list.appendChild(header);
  getStationTimetable(getPoints()).forEach((entry, index) => {
    const row = document.createElement('li');
    row.className = 'station-item';
    if (editing && entry.point) {
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'edit-input'; input.value = entry.name;
      input.maxLength = MAX_STATION_NAME_LENGTH; input.size = 8;
      input.setAttribute('aria-label', (index + 1) + '番目の駅名');
      const save = document.createElement('button'); save.textContent = '保存'; save.className = 'save-btn';
      save.addEventListener('click', () => renamePoint(entry.point.id, input.value));
      const cancel = document.createElement('button'); cancel.textContent = '取消し'; cancel.className = 'cancel-btn';
      cancel.addEventListener('click', updateStationList);
      row.append(input, save, cancel);
    } else {
      const name = document.createElement('span'); name.className = 'station-name';
      name.textContent = (index + 1) + '. ' + entry.name;
      const pop = document.createElement('span'); pop.className = 'station-pop';
      pop.textContent = getPopulationWithinRadius(entry.lat, entry.lng, 5).totalPopulation.toLocaleString() + '人';
      const time = document.createElement('span'); time.className = 'station-time';
      time.textContent = formatTime(Math.ceil(entry.arrivalMinutes));
      row.append(name, pop, time);
    }
    list.appendChild(row);
  });
}
