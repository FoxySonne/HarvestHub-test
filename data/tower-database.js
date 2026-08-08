export const towerDatabase = {
  event: {
    startUtcMinutes: 0,
    endUtcMinutes: 23 * 60 + 50,
    safetyMarginMinutes: 2,
  },

  scoring: {
    barrelPointsPerMinute: 2,
    cranePointsPerMinute: 1,
    successfulCapturePoints: 1,
  },

  scoreDisplay: {
    pointsPerDisplayedStep: 10,
    conservativeHiddenPointsBuffer: 10,
  },

  towerLayouts: [
    {
      id: "1-barrel-1-crane",
      barrels: 1,
      cranes: 1,
      maxPointsPerMinute: 3,
    },
    {
      id: "xl",
      name: "XL",
      barrels: 1,
      cranes: 2,
      maxPointsPerMinute: 4,
    },
    {
      id: "2-barrels-2-cranes",
      barrels: 2,
      cranes: 2,
      maxPointsPerMinute: 6,
    },
  ],

  calculation: {
    allowMultipleOpponents: true,
    successfulOpponentAttackIsFollowedBySuccessfulRetake: true,
    recalculateAfterScoreOrRateChange: true,
    guaranteeRequiresBeatingEveryOpponent: true,
  },
};
