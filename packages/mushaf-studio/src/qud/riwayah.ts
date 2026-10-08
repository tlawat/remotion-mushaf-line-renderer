// The riwayah of a catalogue recitation against the mushaf the studio renders, which is the Hafs
// print (KFGQPC V4): another riwayah can differ from it in words and their spelling.
import type {QudRecitation} from './types';

/**
 * Whether a catalogue recitation is in the Hafs riwayah, the mushaf's own: its `riwayah` label
 * starts with "Hafs" ("Hafs A'n Assem"), any case. An empty label names no other riwayah and counts
 * as Hafs. Warsh, Qalon or Shu'bah are not, and are worth a confirmation before they are timed
 * against the Hafs page.
 */
export const isHafsRecitation = (recitation: Pick<QudRecitation, 'riwayah'>): boolean => {
  const label = recitation.riwayah.trim();
  return label === '' || /^hafs\b/i.test(label);
};
