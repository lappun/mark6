import { scoreMapData } from "./mark6-score";

const moment = require("moment");

const C_LEN = 6;
const DEBUG = true;
let luckyNum = 29;
let targetMax = 9;
const TRIAL_LIMIT = 1000000;
const TRIAL_ALERT = 100000;

export const setLuckyNum = (value) => {
  luckyNum = value;
};

const sortByNum = (n1, n2) => parseInt(n1) - parseInt(n2);

const delay = (time) => {
  console.log('delay', time);
  return new Promise((resolve) => {
    console.log('delaying', time);
    global.setTimeout(resolve, time);
  });
};

const generateSequence = (start, end) => {
  const seq = [];
  for (let i = start; i <= end; i++) {
    seq.push(i);
  }
  return seq;
};

class FileConfig {
  constructor(map) {
    this.map = map || {};
  }
  reset() {
    this.map = {};
  }
  values() {
    return Object.values(this.map);
  }
  set(key, value) {
    this.map[key] = value;
  }
  get(key) {
    return this.map[key];
  }
}

const resultMap = new FileConfig();
const mark6ScoreMap = new FileConfig(scoreMapData);

const filterSequence = (seq, text) => {
  let selected = null;
  if (typeof text === "string") {
    selected = JSON.parse(text);
  } else {
    selected = text;
  }
  const nextSeq = [];
  if (DEBUG) console.log("filterSequence seq", seq);
  if (DEBUG) console.log("filterSequence selected", selected);
  for (const num of seq) {
    if (!selected.includes(num)) {
      nextSeq.push(num);
    }
  }
  return nextSeq;
};

const randomize = (arr) => {
  let i, j, tmp;
  for (i = arr.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
};

const findByCondition = (prefix, seq, count, filter) => {
  if (prefix.length > C_LEN) {
    throw Error("prefix length should not larger than " + C_LEN);
  }
  const key = "findByCondition_" + JSON.stringify(prefix);
  if (resultMap.get(key)) {
    return resultMap.get(key);
  }
  randomize(seq);
  if (DEBUG) console.log("findByCondition prefix", prefix);
  let parents = prefix;
  if (typeof parents === "string") {
    parents = JSON.parse(parents);
  }
  let result = JSON.stringify(
    [...parents, ...seq.slice(0, count)].sort(sortByNum)
  );
  let trial = 0;
  while (!filter(result)) {
    trial++;
    if (trial > 1000) {
      console.log("too many trial", trial);
      break;
    }
    randomize(seq);
    result = JSON.stringify(
      [...parents, ...seq.slice(0, count)].sort(sortByNum)
    );
  }
  resultMap.set(key, result);
  return result;
};

const filterBySum = (text) => {
  let sum = 0;
  for (const element of text) {
    const ch = element;
    if (ch.match(/\d/)) {
      sum += parseInt(ch, 10);
    }
  }
  const remainder = sum % luckyNum;
  if (DEBUG && remainder === 0) console.log("found match", text, sum);

  return remainder === 0 && filterByScore(text);
};

const filterByScore = (text) => {
  const score = calculateScore(text);
  const attrs = ["max", "min", "match", "score"];
  let isValid = true;
  for (const attr of attrs) {
    for (let i = 1; i <= 4; i++) {
      const avg = mark6ScoreMap.get(attr)?.avg;
      const std = mark6ScoreMap.get(attr)?.std;
      if (!isNaN(score?.[i]?.[attr]) && avg && std) {
        let delta = score?.[i]?.[attr] - avg;
        if (delta < 0) delta = delta * -1;
        if (delta + std > avg) {
          isValid = false;
        }
      }
    }
  }
  if (score.max < targetMax) isValid = false;
  if (isValid) {
    if (DEBUG) console.log("passed", text);
  } else {
    if (DEBUG) console.log("failed", text);
  }
  return isValid;
};

const generatePossibileGeneration = async (seq) => {
  const key = JSON.stringify(seq);
  if (resultMap.get(key)) {
    return resultMap.get(key);
  }
  let lastIndex = 0;
  const filter = filterBySum;
  const firstRound = await generateAllCombination({ seq, filter, lastIndex });
  console.log("firstRound", firstRound);
  const secondRound = await generateAllCombination(firstRound);
  console.log("secondRound", secondRound);
  resultMap.set(key, secondRound.results);
  return secondRound.results;
};

const generateAllCombination = async ({ seq, filter, lastIndex, results }) => {
  if (!results) results = [];
  while (seq.length > 6) {
    randomize(seq);
    const c = await generateCombination(seq, C_LEN, filter);
    if (c) {
      seq = filterSequence(seq, c);
      results.push(c);
    } else {
      break;
    }
  }
  return { results, seq, lastIndex };
};

let generateCount = 0;
const batchSize = 50000;
let promises = [];
const generateCombination = async (numbers, count, filter) => {
  const results = [];
  generateCount = 0;
  await generateCombinationImpl([], numbers, count, filter, results);
  while (promises.length > 0) {
    const bs = batchSize < promises.length ? batchSize : promises.length;
    const batch = promises.slice(0, bs);
    await Promise.all(batch);
    await delay(500);
    promises = promises.slice(bs);
  }
  if (results.length > 0) {
    return results[0];
  } else {
    return null;
  }
};

const generateCombinationImpl = (parents, numbers, remain, filter, results) => {
  return new Promise(async (resolve) => {
      if (results.length > 0) {
        resolve();
      } else if (remain > 0) {
        randomize(numbers);
        if (generateCount < TRIAL_LIMIT) {
          for (const num of numbers) {
            if (parents.indexOf(num) === -1) {
              promises.push(
                generateCombinationImpl(
                  [...parents, num],
                  numbers,
                  remain - 1,
                  filter,
                  results
                )
              );
            }
          }
        }
        resolve();
      } else {
        generateCount++;
        if (generateCount % TRIAL_ALERT === 0) {
          console.log("generateCount", generateCount);
        }
        addCombinationToResultSet(parents, filter, results);
        resolve();
      }
  });
};

const addCombinationToResultSet = (parents, filter, results) => {
  const text = JSON.stringify(parents.sort(sortByNum));
  if (filter) {
    if (filter(text, results)) {
      if (results.indexOf(text) === -1) {
        results.push(text);
      }
    }
  } else {
    results.push(text);
  }
};

const getRemaining = (result, remaining) => {
  if (!remaining) remaining = generateSequence(1, 49);
  if (!Array.isArray(result)) {
    result = [result];
  }
  for (const c of result) {
    if (DEBUG) console.log("filterSequence remaining", remaining);
    if (DEBUG) console.log("filterSequence c", c);
    remaining = filterSequence(remaining, c);
  }
  return remaining;
};

export const generateMark6PossibleResults = async () => {
  console.log("wait for 1 second");
  await delay(1000);
  const startTime = moment();
  let seq = generateSequence(1, 49);
  const step1 = await generatePossibileGeneration(seq);
  console.log("step1", step1);
  const remaining1 = getRemaining(step1);
  console.log("remaining1", remaining1);
  seq = generateSequence(1, 49);
  seq = filterSequence(seq, remaining1);
  const step2 = await findByCondition(remaining1, seq, 5, filterBySum);
  console.log("step2", step2);
  const remaining2 = getRemaining(step2);
  console.log("remaining2", remaining2);
  seq = [...remaining1, ...remaining2];
  const step3 = await generatePossibileGeneration(seq);
  console.log("step3", step3);
  const remaining3 = getRemaining(step3, [...remaining1, ...remaining2]);
  console.log("remaining3", remaining3);
  seq = generateSequence(1, 49);
  const step4 = await findByCondition(remaining3, seq, 4, filterBySum);
  const results = [...step1, step2, ...step3, step4];
  const scores = results.map((r) => calculateScore(r));
  const total = {};
  for (let i = 1; i <= 4; i++) {
    total[i] = {};
    const max = scores.map((s) => s[i].max);
    const match = scores.map((s) => s[i].match);
    total[i].max = max?.reduce((sp, s) => (sp || 0) + s);
    total[i].match = match?.reduce((sp, s) => (sp || 0) + s);
  }
  console.log({ results, scores, total });
  const endTime = moment();
  const processingTime = endTime.diff(startTime);
  console.log("processingTime", processingTime);
  return results;
};

const generateScoreCombination = (
  scoreMap,
  score,
  prefix,
  options,
  len,
  fx
) => {
  if (len > 0) {
    for (const o of options) {
      if (!prefix.includes(o)) {
        generateScoreCombination(
          scoreMap,
          score,
          [...prefix, o],
          options,
          len - 1,
          fx
        );
      }
    }
  } else {
    fx(scoreMap, score, prefix, options);
  }
};

const calculateScore = (row, scoreMap) => {
  try {
    if (!scoreMap) scoreMap = mark6ScoreMap.get("scoreMap");
    const myScore = {};
    const options = JSON.parse(row);
    generateScoreCombination(
      scoreMap,
      myScore,
      [],
      options,
      1,
      calculateScoreOne
    );
    generateScoreCombination(
      scoreMap,
      myScore,
      [],
      options,
      2,
      calculateScoreOne
    );
    generateScoreCombination(
      scoreMap,
      myScore,
      [],
      options,
      3,
      calculateScoreOne
    );
    generateScoreCombination(
      scoreMap,
      myScore,
      [],
      options,
      4,
      calculateScoreOne
    );
    return myScore;
  } catch (error) {
    console.log("row", row);
    throw error;
  }
};

const calculateScoreOne = (scoreMap, myScores, numbers) => {
  numbers.sort();
  const key = numbers.join("_");
  const s1 = scoreMap[key] || 0;
  if (!myScores[numbers.length]) {
    myScores[numbers.length] = {};
  }
  const myScore = myScores[numbers.length];
  const max = myScore.max || 0;
  const min = myScore.min || 10000;
  const matched = myScore.matched || 0;
  const unmatched = myScore.unmatched || 0;
  if (s1 > max) myScore.max = s1;
  if (s1 < min && s1 > 0) myScore.min = s1;
  myScore.matched = matched + (scoreMap[key] === undefined ? 0 : 1);
  myScore.unmatched = unmatched + (scoreMap[key] === undefined ? 1 : 0);
  myScore.match = myScore.matched / (myScore.matched + myScore.unmatched);
  myScore.score = myScore.max / myScore.min;
};
