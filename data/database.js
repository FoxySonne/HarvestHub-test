export const database = {
  .categories: [
    {name: "Снаряжение", id: "equipment"},
    {name: "Герои", id: "heroes"},
    {name: "Титан", id: "titan"},
    {name: "Ускорения", id: "speedups"},
    {name: "Увеличьте силу на 1", id: "power"},
    {name: "Коллекция шефа", id: "chief_collection"},
    {name: "Сбор ресурсов", id: "resource_gathering"},
    {name: "Улучшение войск", id: "troop_upgrade"},
    {name: "Зараженные", id: "infected"},
    {name: "Прочее", id: "misc"}
  ],
  actions: [
    {name: "Синий болт", id: "blue_bolt", categoryId: "equipment"},
    {name: "Фиолетовый болт", id: "purple_bolt", categoryId: "equipment"},
    {name: "Золотой болт", id: "gold_bolt", categoryId: "equipment"},
    {name: "Неизвестный болт", id: "unknown_bolt", categoryId: "equipment"},
    {name: "Увеличение звезд снаряжения", id: "equipment_stars", categoryId: "equipment"},
    {name: "Молот перековки", id: "reforge_hammer", categoryId: "equipment"},
    {name: "Изолента", id: "insulation_tape", categoryId: "equipment"},
    {name: "Желаемый призыв", id: "wish_summon", categoryId: "heroes"},
    {name: "Продвинутый призыв", id: "advanced_summon", categoryId: "heroes"},
    {name: "Стандартный призыв", id: "standard_summon", categoryId: "heroes"},
    {name: "Синий фрагмент героя", id: "blue_hero_card", categoryId: "heroes"},
    {name: "Фиолетовый фрагмент героя", id: "purple_hero_card", categoryId: "heroes"},
    {name: "Золотой фрагмент героя", id: "gold_hero_card", categoryId: "heroes"},
    {name: "Книги героев", id: "hero_books", categoryId: "heroes"},
    {name: "Опыт титана 100 ед", id: "titan_exp_100", categoryId: "titan"},
    {name: "Клетки титана", id: "titan_cells", categoryId: "titan"},
    {name: "1 ед. биогенного белка", id: "biogenic_protein", categoryId: "titan"},
    {name: "Ускорение исследований 1 мин", id: "research_1m", categoryId: "speedups"},
    {name: "Ускорение строительства 1 мин", id: "building_1m", categoryId: "speedups"},
    {name: "Ускорение исцеления 1 мин", id: "healing_1m", categoryId: "speedups"},
    {name: "Ускорение обучения 1 мин", id: "training_1m", categoryId: "speedups"},
    {name: "Увеличьте силу (строительство)", id: "building_power", categoryId: "power"},
    {name: "Увеличьте силу на 1 с помощью исследования", id: "research_power", categoryId: "power"},
    {name: "Чертежи", id: "blueprints", categoryId: "chief_collection"},
    {name: "Шестеренки", id: "gears", categoryId: "chief_collection"},
    {name: "Собрать 100 ед. еды", id: "food_100", categoryId: "resource_gathering"},
    {name: "Собрать 100 ед. древесины", id: "wood_100", categoryId: "resource_gathering"},
    {name: "Собрать 20 ед. металла", id: "metal_20", categoryId: "resource_gathering"},
    {name: "Собрать 5 ед. топлива", id: "fuel_5", categoryId: "resource_gathering"},
    {name: "Покупки", id: "purchases", categoryId: "misc"},
    {name: "1 рейд на нечестивого зараженного", id: "unholy_raid", categoryId: "misc"},
    {name: "Зараженный в разведмиссиях", id: "infected_recon", categoryId: "misc"},
    {name: "Завершение разведмиссий пн, пт", id: "recon_mon_fri", categoryId: "misc"},
    {name: "Завершение разведмиссий ср", id: "recon_wed", categoryId: "misc"},
    {name: "Отправки S-класс", id: "dispatch_s", categoryId: "misc", quantityOptions: {
    min: 1,
    max: 8
  }},
    {name: "Грузовики А-класс", id: "truck_a", categoryId: "misc", quantityOptions: {
    min: 1,
    max: 4
}},
    {name: "Используйте очки выносливости", id: "stamina_points", categoryId: "misc"},
    {name: "Используйте очки VS", id: "vs_points", categoryId: "misc"},
    {name: "Улучшение войск", id: "troop_upgrade", categoryId: "troop_upgrade",
options: [
{value: 1 ,label: "1 уровень"},
{value: 2 ,label: "2 уровень"},
{value: 3 ,label: "3 уровень"},
{value: 4 ,label: "4 уровень"},
{value: 5 ,label: "5 уровень"},
{value: 6 ,label: "6 уровень"},
{value: 7 ,label: "7 уровень"},
{value: 8 ,label: "8 уровень"},
{value: 9 ,label: "9 уровень"},
{value: 10 ,label: "10 уровень"}
]
 },
    {name: "Уничтожайте зараженных", id: "infected", categoryId: "infected",
options:[
{value: 1, label: "Зараженные 1–6 ур"},
{value: 2, label: "Зараженные 7-12 ур"},
{value: 3, label: "Зараженные 13–18 ур"},
{value: 4, label: "Зараженные 19–24 ур"},
{value: 5, label: "Зараженные 25-30 ур"}
]
},
 ],
dayOrder: ["mon","tue","wed","thu","fri","sat","sun"],
  days: { 
    mon: {
      name: "понедельник",
      turtle: [
{type: "categories", id: "equipment"},
{type: "categories", id: "troop_upgrade"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "purchases"},
              ],
      vs: [
{type: "categories", id: "resource_gathering"},
{type: "actions", id: "purchases"},
{type: "actions", id: "recon_mon_fri"},
{type: "actions", id: "stamina_points"},
{type: "", id: "blue_bolt"},
{type: "", id: "purple_bolt"},    
{type: "", id: "gold_bolt"}, 
{type: "", id: "unknown_bolt"},      
  ]
    },
tue: {
      name: "вторник",
      turtle: [
{type: " categories", id: "equipment"},
{type: "actions", id: "building_1m"},
{type: "actions", id: "purchases"},
],
      vs: [
{type: "actions", id: "truck_a"},
{type: "actions", id: "dispatch_s"},
{type: "actions", id: "building_1m"},
{type: "actions", id: "building_power"},
{type: "actions", id: "purchases"}
 ]
    },
wed: {
      name: "среда",
      turtle: [
{type: "categories", id: "titan"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "purchases"}
],
      vs: [
{type: "categories", id: "titan"},
{type: "actions", id: "vs_points"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "research_power"},
{type: "actions", id: "recon_wed"},
{type: "actions", id: "purchases"}
 ]
    },
thu: {
      name: "четверг",
      turtle: [
{type: "categories", id: "heroes"},
{type: "actions", id: "purchases"}
],
      vs: [
{type: "categories", id: "heroes"},
{type: "actions", id: "purchases"}
 ]
    },
fri: {
      name: "пятница",
      turtle: [
{type: "categories", id: "equipment"},
{type: "categories", id: "chief_collection"},
{type: "actions", id: "purchases"}
],
      vs: [
{type: "categories", id: "troop_upgrade"},
{type: "categories", id: "power"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "building_1m"},
{type: "actions", id: "training_1m"},
{type: "actions", id: "recon_mon_fri"},
{type: "actions", id: "purchases"}
 ]
    },
sat: {
      name: "суббота",
      turtle: [
{type: "categories", id: "titan"},
{type: "actions", id: "blue_hero_card"},
{type: "actions", id: "purple_hero_card"},
{type: "actions", id: "gold_hero_card"},
{type: "actions", id: "hero_books"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "building_1m"},
{type: "actions", id: "purchases"}
],
      vs: [
{type: "categories", id: "titan"},
{type: "categories", id: "speedups"},
{type: "actions", id: "blue_hero_card"},
{type: "actions", id: "purple_hero_card"},
{type: "actions", id: "gold_hero_card"},
{type: "actions", id: "hero_books"},
{type: "actions", id: "dispatch_s"},
{type: "actions", id: "truck_a"},
{type: "actions", id: "purchases"}
 ]
    },
sun: {
      name: "воскресенье",
      turtle: [
{type: "categories", id: "heroes"},
{type: "categories", id: "titan"},
{type: "categories", id: "chief_collection"},
{type: "categories", id: "resource_gathering"},
{type: "categories", id: "equipment"},
{type: "actions", id: "research_1m"},
{type: "actions", id: "building_1m"},
{type: "actions", id: "unholy_raid"},
{type: "actions", id: "infected_recon"},
{type: "", id: "infected"},
{type: "actions", id: "purchases"}
],
 vs: [none]}
  }};
