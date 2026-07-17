export const seasonDatabase = {
  energy: {
    canEnergy: 10,
    regularCanCost: 300,
    discountCanCost: 240,
    maxDiscountDiamonds: 12000
  },

  alphaDrops: [
    { level: 1, primary: 10, secondary: 1000 },
    { level: 2, primary: 20, secondary: 1000 },
    { level: 3, primary: 30, secondary: 1000 },
    { level: 4, primary: 40, secondary: 2000 },
    { level: 5, primary: 50, secondary: 2000 },
    { level: 6, primary: 60, secondary: 3000 },
    { level: 7, primary: 70, secondary: 3000 },
    { level: 8, primary: 80, secondary: 4000 },
    { level: 9, primary: 90, secondary: 4000 },
    { level: 10, primary: 100, secondary: 5000 }
  ],

  infectedDrops: [
    { level: 1, primary: 3, secondary: 40 },
    { level: 2, primary: 3, secondary: 60 },
    { level: 3, primary: 3, secondary: 80 },
    { level: 4, primary: 3, secondary: 100 },
    { level: 5, primary: 3, secondary: 120 },
    { level: 6, primary: 3, secondary: 140 },
    { level: 7, primary: 6, secondary: 160 },
    { level: 8, primary: 6, secondary: 180 },
    { level: 9, primary: 6, secondary: 200 },
    { level: 10, primary: 6, secondary: 220 },
    { level: 11, primary: 10, secondary: 240 },
    { level: 12, primary: 10, secondary: 260 },
    { level: 13, primary: 10, secondary: 280 },
    { level: 14, primary: 13, secondary: 300 },
    { level: 15, primary: 13, secondary: 350 },
    { level: 16, primary: 13, secondary: 400 },
    { level: 17, primary: 16, secondary: 450 },
    { level: 18, primary: 16, secondary: 500 },
    { level: 19, primary: 16, secondary: 550 },
    { level: 20, primary: 16, secondary: 600 },
    { level: 21, primary: 16, secondary: 650 },
    { level: 22, primary: 16, secondary: 700 },
    { level: 23, primary: 20, secondary: 750 },
    { level: 24, primary: 20, secondary: 800 },
    { level: 25, primary: 20, secondary: 850 },
    { level: 26, primary: 20, secondary: 900 },
    { level: 27, primary: 20, secondary: 950 },
    { level: 28, primary: 20, secondary: 1000 },
    { level: 29, primary: 20, secondary: 1050 },
    { level: 30, primary: 20, secondary: 1100 }
  ],

  productionByBuildingLevel: [
    { level: 1, secondary: 600, primary: 100 },
    { level: 2, secondary: 840, primary: 140 },
    { level: 3, secondary: 1080, primary: 180 },
    { level: 4, secondary: 1320, primary: 220 },
    { level: 5, secondary: 1560, primary: 260 },
    { level: 6, secondary: 1800, primary: 300 },
    { level: 7, secondary: 1920, primary: 320 },
    { level: 8, secondary: 2160, primary: 360 },
    { level: 9, secondary: 2400, primary: 400 },
    { level: 10, secondary: 2640, primary: 440 },
    { level: 11, secondary: 2880, primary: 480 },
    { level: 12, secondary: 3120, primary: 520 },
    { level: 13, secondary: 3360, primary: 560 },
    { level: 14, secondary: 3480, primary: 580 },
    { level: 15, secondary: 3600, primary: 600 },
    { level: 16, secondary: 3900, primary: 650 },
    { level: 17, secondary: 4200, primary: 700 },
    { level: 18, secondary: 4500, primary: 750 },
    { level: 19, secondary: 4800, primary: 800 },
    { level: 20, secondary: 5100, primary: 850 },
    { level: 21, secondary: 5400, primary: 900 },
    { level: 22, secondary: 5700, primary: 950 },
    { level: 23, secondary: 6000, primary: 1000 },
    { level: 24, secondary: 7200, primary: 1200 },
    { level: 25, secondary: 8400, primary: 1400 },
    { level: 26, secondary: 9600, primary: 1600 },
    { level: 27, secondary: 10800, primary: 1800 },
    { level: 28, secondary: 12000, primary: 2000 },
    { level: 29, secondary: 13800, primary: 2300 },
    { level: 30, secondary: 15600, primary: 2600 }
  ],

  labProductionBonus: [
    { level: 0, bonus: 0 },
    { level: 1, bonus: 0.02 },
    { level: 2, bonus: 0.04 },
    { level: 3, bonus: 0.06 },
    { level: 4, bonus: 0.08 },
    { level: 5, bonus: 0.1 }
  ],

  seasonalBuildingProductionBonus: [
    { level: 0, bonus: 0 },
    { level: 1, bonus: 0.05 },
    { level: 2, bonus: 0.08 },
    { level: 3, bonus: 0.1 }
  ],

  oceanAbundanceProductionBonus: [
    { level: 0, bonus: 0 },
    { level: 1, bonus: 0.04 },
    { level: 2, bonus: 0.08 }
  ],

  seasonalBuildingBuildReduction: [
    { level: 0, reduction: 0, label: "0 уровень" },
    { level: 1, reduction: 0.01, label: "1 уровень" },
    { level: 2, reduction: 0.02, label: "2 уровень" },
    { level: 3, reduction: 0.03, label: "3 уровень" }
  ],

  territoryBuffs: {
    villageProduction: 0.05,
    megapolisProduction: 0.2,
    mightyBullProduction: 0.8
  }
};
