export const database = {

  categories: [

    { name: "Снаряжение", id: "equipment" },

    { name: "Герои", id: "heroes" },

    { name: "Титан", id: "titan" },

    { name: "Ускорения", id: "speedups" },

    { name: "Увеличьте силу на 1", id: "power" },

    { name: "Коллекция шефа", id: "chief_collection" },

    { name: "Сбор ресурсов", id: "resource_gathering" },

    { name: "Улучшение войск", id: "troop_upgrade" },

    { name: "Прочее", id: "misc" }

  ],

  actions: [

    { name: "Синий болт", id: "blue_bolt", categoryId: "equipment" },

    { name: "Фиолетовый болт", id: "purple_bolt", categoryId: "equipment" },

    { name: "Золотой болт", id: "gold_bolt", categoryId: "equipment" },

    { name: "? болт", id: "unknown_bolt", categoryId: "equipment" },

    { name: "Увеличение звезд снаряжения", id: "equipment_stars", categoryId: "equipment" },

    { name: "Молот перековки", id: "reforge_hammer", categoryId: "equipment" },

    { name: "Изолента", id: "insulation_tape", categoryId: "equipment" },

    { name: "Желаемый призыв", id: "wish_summon", categoryId: "heroes" },

    { name: "Продвинутый призыв", id: "advanced_summon", categoryId: "heroes" },

    { name: "Стандартный призыв", id: "standard_summon", categoryId: "heroes" },

    { name: "Опыт титана 100 ед", id: "titan_exp_100", categoryId: "titan" },

    { name: "Клетки титана", id: "titan_cells", categoryId: "titan" },

    { name: "Ускорение строительства 1 мин", id: "building_1m", categoryId: "speedups" },

    { name: "Увеличьте силу (строительство)", id: "building_power", categoryId: "power" },

    { name: "Покупки", id: "purchases", categoryId: "misc" },

    { name: "Отправки S-класс", id: "dispatch_s", categoryId: "misc" },

    { name: "Грузовики A-класс", id: "truck_a", categoryId: "misc" }

  ],

  days: {

    tue: {

      name: "Вторник",

      turtle: [

        "dispatch_s",

        "truck_a",

        "building_1m",

        "building_power",

        "blue_bolt",

        "purple_bolt",

        "gold_bolt",

        "equipment_stars",

        "reforge_hammer",

        "insulation_tape",

        "purchases"

      ],

      vs: [

        "dispatch_s",

        "truck_a"

      ]

    }

  }

};