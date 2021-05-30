function isOneOf(word, arr) {
  if (arr == null || arr.length === 0) {
    return false;
  }
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');

  return blacklist.test(word);
}

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

function timeStringToMs(timeString, now) {
  const d = new Date(now);
  const parts = timeString.split(':');
  d.setHours(parts[0]);
  d.setMinutes(parts[1]);
  d.setSeconds(0);
  return d.getTime();
}

function duringWorkingHoursOrNotSet(config, now) {
  const { workingHours } = config;
  if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
    return true;
  }

  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);

  return fromDate <= now && toDate >= now;
}

module.exports = { isOneOf, nullOrEmpty, duringWorkingHoursOrNotSet };
