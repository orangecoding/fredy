// @ts-expect-error TS(7016): Could not find a declaration file for module 'stri... Remove this comment to see the full error message
import stringSimilarity from 'string-similarity';
//if the score is higher than this, it will be considered a match
const MAX_DICE_INDEX = 0.7;
export default (class SimilarityCacheEntry {
  time: any;
  values: any;
  constructor(time: any) {
    this.time = time;
    this.values = [];
  }
  setCacheEntry = (entry: any) => {
    this.values.push(entry);
  };
  getTime = () => {
    return this.time;
  };
  hasSimilarEntries = (value: any) => {
    if (this.values.length > 0) {
      for (let i = 0; i < this.values.length; i++) {
        const index = stringSimilarity.compareTwoStrings(value, this.values[i]);
        if (index >= MAX_DICE_INDEX) {
          return true;
        }
      }
    }
    return false;
  };
});
