// Attendance listings start on the first day a class was actually held, not on the semester's
// start date. Weekdays before that day were never class days, so showing them as "No classes"
// is misleading. Returns '' when no class day exists yet.
export function getAttendanceRangeStart(semesterStart, classDates) {
  let firstClassDay = ''
  for (const date of classDates) {
    if (!firstClassDay || date < firstClassDay) firstClassDay = date
  }
  if (!firstClassDay) return ''
  return firstClassDay > semesterStart ? firstClassDay : semesterStart
}
