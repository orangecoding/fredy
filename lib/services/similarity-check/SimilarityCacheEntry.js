const stringSimilarity = require('string-similarity');

//if the score is higher than this, it will be considered a match
const MAX_DICE_INDEX = 0.7;

/**
 * The similarity check is based on the dice coefficient. => https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient
 *
 * @type {module.SimilarityCacheEntry}
 */
module.exports = class SimilarityCacheEntry {
  constructor(time) {
    this.time = time;
    this.values = [];
  }

  setCacheEntry = (entry) => {
    this.values.push(entry);
  };

  getTime = () => {
    return this.time;
  };

  hasSimilarEntries = (value) => {
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
};
