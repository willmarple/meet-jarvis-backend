/**
 * Add Participant Management Constraints
 * 
 * Adds unique constraints to meeting_participants table to enable proper
 * upsert operations for participant management. This prevents duplicate
 * participant entries for the same meeting.
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add unique constraint for meeting_participants to enable upsert operations
  pgm.addConstraint('meeting_participants', 'meeting_participants_meeting_user_unique', {
    unique: ['meeting_id', 'user_id']
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove the unique constraint
  pgm.dropConstraint('meeting_participants', 'meeting_participants_meeting_user_unique');
};
