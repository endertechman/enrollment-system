// Official ECCD conversion data for Child's Record 2. These are LOOKUP tables copied from
// the ECCD Council / Technical and Administration Manual. Do not replace with a formula.
//
// Scaled-score table layout: one row per scaled score (1-19). Each cell lists the raw
// score(s) that convert to that scaled score for the domain: "5" or "0-3", "-" = none.
// Column order: GM, FM, SH, RL, EL, COG, SE.
// This mirrors the printed table so it can be checked visually against the manual.

export const TABLE_VERSION = 'ECCD Child\u2019s Record 2 (Revised Philippine ECD Checklist)'

const SCALED_ROWS = {
  '3.1-4.0': [
    [1, '0-3', '-', '0-9', '-', '0-2', '-', '0-9'],
    [2, '4', '0-3', '10', '-', '-', '-', '10-11'],
    [3, '5', '-', '11', '0-1', '3', '0', '12'],
    [4, '-', '4', '12', '-', '4', '1', '13'],
    [5, '6', '5', '13-14', '2', '-', '2-3', '14'],
    [6, '7', '-', '15', '-', '5', '4', '15'],
    [7, '8', '6', '16', '3', '-', '5', '16'],
    [8, '9', '-', '17', '-', '-', '6', '17-18'],
    [9, '-', '7', '18-19', '-', '6', '7', '19'],
    [10, '10', '8', '20', '4', '-', '8-9', '20'],
    [11, '11', '-', '21', '-', '7', '10', '21'],
    [12, '12', '9', '22', '5', '-', '11', '22'],
    [13, '-', '-', '23-24', '-', '8', '12', '23'],
    [14, '13', '10', '25', '-', '-', '13-14', '24'],
    [15, '-', '11', '26', '-', '-', '15', '-'],
    [16, '-', '-', '27', '-', '-', '16', '-'],
    [17, '-', '-', '-', '-', '-', '17', '-'],
    [18, '-', '-', '-', '-', '-', '18', '-'],
    [19, '-', '-', '-', '-', '-', '19-21', '-'],
  ],
  '4.1-5.0': [
    [1, '0-5', '0-3', '0-15', '0-1', '-', '0', '0-13'],
    [2, '6', '4', '16', '-', '0-5', '1', '14'],
    [3, '-', '-', '17', '2', '-', '2-3', '15'],
    [4, '7', '5', '18', '-', '-', '4', '16'],
    [5, '8', '6', '19', '-', '6', '5', '17'],
    [6, '-', '-', '20', '3', '-', '6-7', '-'],
    [7, '9', '7', '-', '-', '-', '8', '18'],
    [8, '10', '-', '21', '-', '7', '9-10', '19'],
    [9, '-', '8', '22', '4', '-', '11', '20'],
    [10, '11', '9', '23', '-', '-', '12', '21'],
    [11, '12', '-', '24', '5', '8', '13-14', '22'],
    [12, '-', '10', '25', '-', '-', '15', '23'],
    [13, '13', '-', '26', '-', '-', '16-17', '24'],
    [14, '-', '11', '27', '-', '-', '18', '-'],
    [15, '-', '-', '-', '-', '-', '19-20', '-'],
    [16, '-', '-', '-', '-', '-', '21', '-'],
    [17, '-', '-', '-', '-', '-', '-', '-'],
    [18, '-', '-', '-', '-', '-', '-', '-'],
    [19, '-', '-', '-', '-', '-', '-', '-'],
  ],
  '5.1-5.11': [
    [1, '0-10', '0-5', '-', '0-2', '-', '0-9', '0-15'],
    [2, '-', '-', '0-19', '-', '-', '10', '16'],
    [3, '-', '6', '20', '-', '-', '11', '17'],
    [4, '11', '-', '21', '3', '-', '12', '-'],
    [5, '-', '7', '-', '-', '0-7', '13', '18'],
    [6, '-', '-', '22', '-', '-', '14', '19'],
    [7, '12', '8', '23', '-', '-', '15', '20'],
    [8, '-', '9', '-', '4', '-', '16', '-'],
    [9, '-', '-', '24', '-', '-', '17', '21'],
    [10, '-', '10', '25', '-', '-', '18', '22'],
    [11, '13', '-', '-', '5', '8', '19', '23'],
    [12, '-', '11', '26', '-', '-', '20', '-'],
    [13, '-', '-', '27', '-', '-', '21', '24'],
    [14, '-', '-', '-', '-', '-', '-', '-'],
    [15, '-', '-', '-', '-', '-', '-', '-'],
    [16, '-', '-', '-', '-', '-', '-', '-'],
    [17, '-', '-', '-', '-', '-', '-', '-'],
    [18, '-', '-', '-', '-', '-', '-', '-'],
    [19, '-', '-', '-', '-', '-', '-', '-'],
  ],
}

const COLUMN_DOMAINS = ['grossMotor', 'fineMotor', 'selfHelp', 'receptiveLanguage', 'expressiveLanguage', 'cognitive', 'socioEmotional']

function expandCell(cell) {
  if (cell === '-') return []
  const [from, to = from] = cell.split('-').map(Number)
  return Array.from({ length: to - from + 1 }, (_, index) => from + index)
}

function buildLookup(rows) {
  const lookup = Object.fromEntries(COLUMN_DOMAINS.map((domain) => [domain, {}]))
  for (const [scaled, ...cells] of rows) {
    cells.forEach((cell, column) => {
      for (const raw of expandCell(cell)) lookup[COLUMN_DOMAINS[column]][raw] = scaled
    })
  }
  return lookup
}

// SCALED_LOOKUP[ageGroup][domainKey][rawScore] -> scaled score
export const SCALED_LOOKUP = Object.fromEntries(
  Object.entries(SCALED_ROWS).map(([ageGroup, rows]) => [ageGroup, buildLookup(rows)]),
)

// Age bands in whole months (years * 12 + months). No rounding; the day part is ignored.
// 3.1-4.0 = 3 y 1 m through 4 y 0 m, and so on.
export const AGE_GROUPS = [
  { id: '3.1-4.0', label: '3.1 – 4.0 years', minMonths: 37, maxMonths: 48 },
  { id: '4.1-5.0', label: '4.1 – 5.0 years', minMonths: 49, maxMonths: 60 },
  { id: '5.1-5.11', label: '5.1 – 5.11 years', minMonths: 61, maxMonths: 71 },
]

// Standard Score Equivalent of Sum of Scaled Scores, Child's Record 2.
export const STANDARD_SCORE_TABLE = Object.fromEntries([
  [29, 37], [30, 38], [31, 40], [32, 41], [33, 43], [34, 44], [35, 45], [36, 47], [37, 48],
  [38, 50], [39, 51], [40, 53], [41, 54], [42, 56], [43, 57], [44, 59], [45, 60], [46, 62],
  [47, 63], [48, 65], [49, 66], [50, 67], [51, 69], [52, 70], [53, 72], [54, 73], [55, 75],
  [56, 76], [57, 78], [58, 79], [59, 81], [60, 82], [61, 84], [62, 85], [63, 86], [64, 88],
  [65, 89], [66, 91], [67, 92], [68, 94], [69, 95], [70, 97], [71, 98], [72, 100], [73, 101],
  [74, 103], [75, 104], [76, 105], [77, 107], [78, 108], [79, 110], [80, 111], [81, 113],
  [82, 114], [83, 116], [84, 117], [85, 119], [86, 120], [87, 122], [88, 123], [89, 124],
  [90, 126], [91, 127], [92, 129], [93, 130], [94, 132], [95, 133], [96, 135], [97, 136],
  [98, 138],
])

export const STANDARD_TABLE_MIN_SUM = 29
export const STANDARD_TABLE_MAX_SUM = 98
