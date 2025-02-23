import stringSimilarity from 'string-similarity';

//if the score is higher than this, it will be considered a match
const MAX_DICE_INDEX = 0.7;

export default class SimilarityCacheEntry {
  time: number;
  values: string[];

  constructor(time: number) {
    this.time = time;
    this.values = [];
  }

  public setCacheEntry(entry: string) {
    this.values.push(entry);
  }

  public getTime() {
    return this.time;
  }

  public hasSimilarEntries(value: string) {
    if (this.values.length > 0) {
      for (let i = 0; i < this.values.length; i++) {
        const index = stringSimilarity.compareTwoStrings(value, this.values[i]);
        if (index >= MAX_DICE_INDEX) {
          return true;
        }
      }
    }
    return false;
  }
}
