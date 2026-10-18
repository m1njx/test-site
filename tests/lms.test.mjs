import test from 'node:test';
import assert from 'node:assert/strict';

// Logic from src/lms/VideoPlayer.tsx
function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = merged[merged.length - 1];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function rangesTotal(ranges) {
  return ranges.reduce((acc, [s, e]) => acc + Math.max(0, e - s), 0);
}

test('LMS: mergeRanges merges contiguous and overlapping intervals', () => {
  const input = [
    [0, 10],
    [5, 15],
    [20, 30],
    [25, 35],
    [34, 40],
  ];
  const merged = mergeRanges(input);
  assert.deepEqual(merged, [
    [0, 15],
    [20, 40],
  ]);
});

test('LMS: rangesTotal accurately calculates unique watched duration', () => {
  const merged = [
    [0, 15],
    [20, 40],
  ];
  const total = rangesTotal(merged);
  assert.equal(total, 15 + 20); // 35 seconds
});

test('LMS: 80% anti-skip watch threshold validation', () => {
  const duration = 100;
  const watchedRanges = [
    [0, 40],
    [30, 80], // overlaps -> [0, 80] = 80s
  ];
  const merged = mergeRanges(watchedRanges);
  const watchedSec = rangesTotal(merged);
  const isCompleted = duration > 0 && watchedSec / duration >= 0.8;

  assert.equal(isCompleted, true);

  // If only watched 79s
  const partial = [
    [0, 50],
    [60, 89], // total 50 + 29 = 79s
  ];
  const partialMerged = mergeRanges(partial);
  const partialSec = rangesTotal(partialMerged);
  assert.equal(partialSec / duration >= 0.8, false);
});

test('LMS: formatAnswer formats single, multiple, and empty answers', () => {
  function formatAnswer(q, val) {
    if (val === undefined || val === null || val === '') return '(미입력)';
    if (Array.isArray(val)) {
      if (val.length === 0) return '(미입력)';
      return val.map((v) => q.options?.[parseInt(v, 10)] || v).join(', ');
    }
    if (q.type === 'short') return String(val);
    const parsed = parseInt(String(val), 10);
    return !isNaN(parsed) && q.options?.[parsed] ? q.options[parsed] : String(val);
  }

  const multiQ = {
    id: '1',
    type: 'multiple-multi',
    options: ['사과', '바나나', '포도'],
  };

  assert.equal(formatAnswer(multiQ, ['0', '2']), '사과, 포도');
  assert.equal(formatAnswer(multiQ, []), '(미입력)');
  assert.equal(formatAnswer(multiQ, undefined), '(미입력)');

  const shortQ = { id: '2', type: 'short' };
  assert.equal(formatAnswer(shortQ, 'print(1)'), 'print(1)');
  assert.equal(formatAnswer(shortQ, ''), '(미입력)');
});

