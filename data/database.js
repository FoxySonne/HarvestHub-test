export const database = {
  category: [
    {name: "Снаряжение", id: "equipment"},
    {name: "Герои", id: "heroes"},
    {name: "Титан", id: "titan"},
    {name: "Коллекция шефа", id: "chief_collection"},
    {name: "Улучшение войск", id: "troop_upgrade"},
    {name: "Ускорения", id: "speedups"},
    {name: "Увеличьте силу на 1", id: "power"},
    {name: "Сбор ресурсов", id: "resource_gathering"},
    {name: "Зараженные", id: "infected"},
    {name: "Прочее", id: "misc"},
  ],

  action: [
    {name: "Синий болт", id: "blue_bolt", categoryId: "equipment", points: {turtle: 4000, vs: 2900, ipk: 714}},
    {name: "Фиолетовый болт", id: "purple_bolt", categoryId: "equipment", points: {turtle: 16000, vs: 11500, ipk: 2857}},
    {name: "Золотой болт", id: "gold_bolt", categoryId: "equipment", points: {turtle: 80000, vs: 57200, ipk: 14286}},
    {name: "Неизвестный болт", id: "unknown_bolt", categoryId: "equipment", points: {turtle: 400000, vs: 285800, ipk: 71429}},
    {name: "Увеличение звезд снаряжения", id: "equipment_stars", categoryId: "equipment", points: {turtle: 2200000, vs: 0, ipk: 0}},
    {name: "Молот перековки", id: "reforge_hammer", categoryId: "equipment", points: {turtle: 8000, vs: 0, ipk: 0}},
    {name: "Изолента", id: "insulation_tape", categoryId: "equipment", points: {turtle: 600000, vs: 0, ipk: 0}},

    {name: "Желаемый призыв", id: "wish_summon", categoryId: "heroes", points: {turtle: 20000, vs: 13400, ipk: 0}},
    {name: "Продвинутый призыв", id: "advanced_summon", categoryId: "heroes", points: {turtle: 8000, vs: 3000, ipk: 0}},
    {name: "Стандартный призыв", id: "standard_summon", categoryId: "heroes", points: {turtle: 2000, vs: 500, ipk: 0}},
    {name: "Синий фрагмент героя", id: "blue_hero_card", categoryId: "heroes", points: {turtle: 3000, vs: 160, ipk: 150}},
    {name: "Фиолетовый фрагмент героя", id: "purple_hero_card", categoryId: "heroes", points: {turtle: 9000, vs: 1600, ipk: 1000}},
    {name: "Золотой фрагмент героя", id: "gold_hero_card", categoryId: "heroes", points: {turtle: 35000, vs: 15200, ipk: 9000}},
    {name: "Книги героев", id: "hero_books", categoryId: "heroes", points: {turtle: 2500, vs: 5000, ipk: 857}},

    {name: "Опыт титана 100 ед", id: "titan_exp_100", categoryId: "titan", points: {turtle: 1000, vs: 1000, ipk: 200}},
    {name: "Клетки титана", id: "titan_cells", categoryId: "titan", points: {turtle: 20000, vs: 12000, ipk: 2800}},
    {name: "1 ед. биогенного белка", id: "biogenic_protein", categoryId: "titan", points: {turtle: 12000, vs: 10000, ipk: 0}},

    {name: "Чертежи", id: "blueprints", categoryId: "chief_collection", points: {turtle: 150000, vs: 0, ipk: 630}},
    {name: "Шестеренки", id: "gears", categoryId: "chief_collection", points: {turtle: 3000, vs: 0, ipk: 29000}},

    {
      name: "Улучшение войск",
      id: "troop_upgrade",
      categoryId: "troop_upgrade",
      options: [
        {value: 1, label: "1 lvl"},
        {value: 2, label: "2 lvl"},
        {value: 3, label: "3 lvl"},
        {value: 4, label: "4 lvl"},
        {value: 5, label: "5 lvl"},
        {value: 6, label: "6 lvl"},
        {value: 7, label: "7 lvl"},
        {value: 8, label: "8 lvl"},
        {value: 9, label: "9 lvl"},
        {value: 10, label: "10 lvl"},
      ],
      points: {
        turtle: {1: 32, 2: 55, 3: 90, 4: 115, 5: 144, 6: 190, 7: 240, 8: 340, 9: 540, 10: 1200},
        vs: {1: 6, 2: 11, 3: 17, 4: 22, 5: 26, 6: 33, 7: 37, 8: 44, 9: 52, 10: 60},
        ipk: {1: 4, 2: 7, 3: 12, 4: 15, 5: 18, 6: 22, 7: 25, 8: 30, 9: 35, 10: 40},
      },
    },

    {name: "Ускорение исследований 1 мин", id: "research_1m", categoryId: "speedups", points: {turtle: 700, vs: 250, ipk: 42}},
    {name: "Ускорение строительства 1 мин", id: "building_1m", categoryId: "speedups", points: {turtle: 700, vs: 250, ipk: 42}},
    {name: "Ускорение исцеления 1 мин", id: "healing_1m", categoryId: "speedups", points: {turtle: 0, vs: 250, ipk: 0}},
    {name: "Ускорение обучения 1 мин", id: "training_1m", categoryId: "speedups", points: {turtle: 0, vs: 250, ipk: 42}},

    {name: "Увеличьте силу на 1 с помощью строительства", id: "building_power", categoryId: "power", points: {turtle: 0, vs: 4, ipk: 3}},
    {name: "Увеличьте силу на 1 с помощью исследования", id: "research_power", categoryId: "power", points: {turtle: 0, vs: 9, ipk: 3}},

    {name: "Собрать 100 ед. еды", id: "food_100", categoryId: "resource_gathering", points: {turtle: 2, vs: 1, ipk: 0}},
    {name: "Собрать 100 ед. древесины", id: "wood_100", categoryId: "resource_gathering", points: {turtle: 2, vs: 1, ipk: 0}},
    {name: "Собрать 20 ед. металла", id: "metal_20", categoryId: "resource_gathering", points: {turtle: 2, vs: 1, ipk: 0}},
    {name: "Собрать 5 ед. топлива", id: "fuel_5", categoryId: "resource_gathering", points: {turtle: 2, vs: 1, ipk: 0}},

    {
      name: "Уничтожайте зараженных",
      id: "infected",
      categoryId: "infected",
      options: [
        {value: 1, label: "Зараженные 1–6 ур"},
        {value: 2, label: "Зараженные 7-12 ур"},
        {value: 3, label: "Зараженные 13–18 ур"},
        {value: 4, label: "Зараженные 19–24 ур"},
        {value: 5, label: "Зараженные 25-30 ур"},
      ],
      points: {
        turtle: {1: 10000, 2: 10500, 3: 11000, 4: 11500, 5: 12000},
        vs: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        ipk: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
      },
    },

    {name: "1 рейд на нечестивого зараженного", id: "unholy_raid", categoryId: "misc", points: {turtle: 30000, vs: 0, ipk: 0}},
    {name: "Зараженный в разведмиссиях", id: "infected_recon", categoryId: "misc", points: {turtle: 60000, vs: 0, ipk: 0}},
    {name: "Завершение разведмиссий", id: "recon_mon_fri", categoryId: "misc", points: {turtle: 0, vs: 37500, ipk: 30000}},
    {name: "Завершение разведмиссий", id: "recon_wed", categoryId: "misc", points: {turtle: 0, vs: 30000, ipk: 0}},
    {name: "Отправки S-класс", id: "dispatch_s", categoryId: "misc", quantityOptions: {min: 1, max: 8}, points: {turtle: 0, vs: 75000, ipk: 0}},
    {name: "Грузовики А-класс", id: "truck_a", categoryId: "misc", quantityOptions: {min: 1, max: 4}, points: {turtle: 0, vs: 50000, ipk: 0}},
    {name: "Используйте очки выносливости", id: "stamina_points", categoryId: "misc", points: {turtle: 0, vs: 300, ipk: 0}},
    {name: "Используйте очки VS", id: "vs_points", categoryId: "misc", points: {turtle: 0, vs: 2500, ipk: 0}},
    {name: "Покупки", id: "purchases", categoryId: "misc", points: {turtle: 400, vs: 20, ipk: 60}},
  ],

  categoryIpk: [
    {
      id: "building",
      name: "Строительство поселения",
      target: 250000,
      actions: [
        {id: "building_power"},
        {id: "building_1m"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "research",
      name: "Исследование технологий",
      target: 200000,
      actions: [
        {id: "research_power"},
        {id: "research_1m"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "equipment",
      name: "Усиление снаряжения",
      target: 200000,
      actions: [
        {id: "blue_bolt"},
        {id: "purple_bolt"},
        {id: "gold_bolt"},
        {id: "unknown_bolt"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "titan",
      name: "Развитие титана",
      target: 200000,
      actions: [
        {id: "titan_cells"},
        {id: "titan_exp_100"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "heroes",
      name: "Улучшение героя",
      target: 300000,
      actions: [
        {id: "gold_hero_card"},
        {id: "purple_hero_card"},
        {id: "blue_hero_card"},
        {id: "hero_books"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "chief",
      name: "Шеф коллекция",
      target: 300000,
      actions: [
        {id: "gears"},
        {id: "blueprints"},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
    {
      id: "troops",
      name: "Улучшение войск",
      target: 300000,
      actions: [
        {id: "training_1m"},
        {id: "troop_upgrade", option: 1, label: "Обучить солдат 1 ур."},
        {id: "troop_upgrade", option: 2, label: "Обучить солдат 2 ур."},
        {id: "troop_upgrade", option: 3, label: "Обучить солдат 3 ур."},
        {id: "troop_upgrade", option: 4, label: "Обучить солдат 4 ур."},
        {id: "troop_upgrade", option: 5, label: "Обучить солдат 5 ур."},
        {id: "troop_upgrade", option: 6, label: "Обучить солдат 6 ур."},
        {id: "troop_upgrade", option: 7, label: "Обучить солдат 7 ур."},
        {id: "troop_upgrade", option: 8, label: "Обучить солдат 8 ур."},
        {id: "troop_upgrade", option: 9, label: "Обучить солдат 9 ур."},
        {id: "troop_upgrade", option: 10, label: "Обучить солдат 10 ур."},
        {id: "purchases", label: "Получайте алмазы x1"},
      ],
    },
  ],

  dayOrder: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],

  days: {
    mon: {
      name: "понедельник",
      turtle: [
        {type: "category", id: "equipment"},
        {type: "action", id: "troop_upgrade"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "category", id: "resource_gathering"},
        {type: "action", id: "purchases"},
        {type: "action", id: "recon_mon_fri"},
        {type: "action", id: "stamina_points"},
        {type: "action", id: "blue_bolt"},
        {type: "action", id: "purple_bolt"},
        {type: "action", id: "gold_bolt"},
        {type: "action", id: "unknown_bolt"},
      ],
    },

    tue: {
      name: "вторник",
      turtle: [
        {type: "category", id: "equipment"},
        {type: "action", id: "building_1m"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "action", id: "truck_a"},
        {type: "action", id: "dispatch_s"},
        {type: "action", id: "building_1m"},
        {type: "action", id: "building_power"},
        {type: "action", id: "purchases"},
      ],
    },

    wed: {
      name: "среда",
      turtle: [
        {type: "category", id: "titan"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "category", id: "titan"},
        {type: "action", id: "vs_points"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "research_power"},
        {type: "action", id: "recon_wed"},
        {type: "action", id: "purchases"},
      ],
    },

    thu: {
      name: "четверг",
      turtle: [
        {type: "category", id: "heroes"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "category", id: "heroes"},
        {type: "action", id: "purchases"},
      ],
    },

    fri: {
      name: "пятница",
      turtle: [
        {type: "category", id: "equipment"},
        {type: "category", id: "chief_collection"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "action", id: "troop_upgrade"},
        {type: "category", id: "power"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "building_1m"},
        {type: "action", id: "training_1m"},
        {type: "action", id: "recon_mon_fri"},
        {type: "action", id: "purchases"},
      ],
    },

    sat: {
      name: "суббота",
      turtle: [
        {type: "category", id: "titan"},
        {type: "action", id: "blue_hero_card"},
        {type: "action", id: "purple_hero_card"},
        {type: "action", id: "gold_hero_card"},
        {type: "action", id: "hero_books"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "building_1m"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "category", id: "titan"},
        {type: "category", id: "speedups"},
        {type: "action", id: "blue_hero_card"},
        {type: "action", id: "purple_hero_card"},
        {type: "action", id: "gold_hero_card"},
        {type: "action", id: "hero_books"},
        {type: "action", id: "dispatch_s"},
        {type: "action", id: "truck_a"},
        {type: "action", id: "purchases"},
      ],
    },

    sun: {
      name: "воскресенье",
      turtle: [
        {type: "category", id: "heroes"},
        {type: "category", id: "titan"},
        {type: "category", id: "chief_collection"},
        {type: "category", id: "resource_gathering"},
        {type: "category", id: "equipment"},
        {type: "action", id: "research_1m"},
        {type: "action", id: "building_1m"},
        {type: "action", id: "unholy_raid"},
        {type: "action", id: "infected_recon"},
        {type: "action", id: "infected"},
        {type: "action", id: "purchases"},
      ],
      vs: [
        {type: "text", text: "Отдыхаем, кайфуем, собираем воду в резервуаре!"},
      ],
    },
  },
};
