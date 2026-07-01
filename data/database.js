export const database = {
  category: [
    { name: "Снаряжение", id: "equipment"},
    { name: "Герои", id: "heroes"},
    { name: "Титан", id: "titan"},
    { name: "Ускорения", id: "speedups"},
    { name: "Увеличьте силу на 1", id: "power"},
    { name: "Коллекция шефа", id: "chief_collection"},
    { name: "Сбор ресурсов", id: "resource_gathering"},
    { name: "Улучшение войск", id: "troop_upgrade"},
    {name: "Зараженные", id: "infected"},
    { name: "Прочее", id: "misc"}, 
 ],
  action: [
    { name: "Синий болт", id: "blue_bolt", categoryId: "equipment"},
    { name: "Фиолетовый болт", id: "purple_bolt", categoryId: "equipment"},
    { name: "Золотой болт", id: "gold_bolt", categoryId: "equipment"},
    { name: "Неизвестный болт", id: "unknown_bolt", categoryId: "equipment"},
    { name: "Увеличение звезд снаряжения", id: "equipment_stars", categoryId: "equipment"},
    { name: "Молот перековки", id: "reforge_hammer", categoryId: "equipment"},
    { name: "Изолента", id: "insulation_tape", categoryId: "equipment"},
    { name: "Желаемый призыв", id: "wish_summon", categoryId: "heroes"},
    { name: "Продвинутый призыв", id: "advanced_summon", categoryId: "heroes"},
    { name: "Стандартный призыв", id: "standard_summon", categoryId: "heroes"},
    { name: "Синий фрагмент героя", id: "blue_hero_card", categoryId: "heroes"},
    { name: "Фиолетовый фрагмент героя", id: "purple_hero_card", categoryId: "heroes"},
    { name: "Золотой фрагмент героя", id: "gold_hero_card", categoryId: "heroes"},
    { name: "Книги героев", id: "hero_books", categoryId: "heroes"},
    { name: "Опыт титана 100 ед", id: "titan_exp_100", categoryId: "titan"},
    { name: "Клетки титана", id: "titan_cells", categoryId: "titan"},
    { name: "1 ед. биогенного белка", id: "biogenic_protein", categoryId: "titan"},
    { name: "Ускорение исследований 1 мин", id: "research_1m", categoryId: "speedups"},
    { name: "Ускорение строительства 1 мин", id: "building_1m", categoryId: "speedups"},
    { name: "Ускорение исцеления 1 мин", id: "healing_1m", categoryId: "speedups"},
    { name: "Ускорение обучения 1 мин", id: "training_1m", categoryId: "speedups"},
    { name: "Увеличьте силу (строительство)", id: "building_power", categoryId: "power"},
  { name: "Увеличьте силу на 1 с помощью исследования", id: "research_power", categoryId: "power"},
    { name: "Чертежи", id: "blueprints", categoryId: "chief_collection"},
    { name: "Шестеренки", id: "gears", categoryId: "chief_collection"},
    { name: "Собрать 100 ед. еды", id: "food_100", categoryId: "resource_gathering"},
    { name: "Собрать 100 ед. древесины", id: "wood_100", categoryId: "resource_gathering"},
    { name: "Собрать 20 ед. металла", id: "metal_20", categoryId: "resource_gathering"},
    { name: "Собрать 5 ед. топлива", id: "fuel_5", categoryId: "resource_gathering"},
    { name: "Покупки", id: "purchases", categoryId: "misc"},
    { name: "1 рейд на нечестивого зараженного", id: "unholy_raid", categoryId: "misc"},
    { name: "Зараженный в разведмиссиях", id: "infected_recon", categoryId: "misc"},
    { name: "Завершение разведмиссий пн, пт", id: "recon_mon_fri", categoryId: "misc"},
    { name: "Завершение разведмиссий ср", id: "recon_wed", categoryId: "misc"},
    { name: "Отправки S-класс", id: "dispatch_s", categoryId: "misc", quantityOptions: {
    min: 1,
    max: 8
  }},
    { name: "Грузовики А-класс", id: "truck_a", categoryId: "misc", quantityOptions: {
    min: 1,
    max: 4
}},
    { name: "Используйте очки выносливости", id: "stamina_points", categoryId: "misc"},
    { name: "Используйте очки VS", id: "vs_points", categoryId: "misc"},
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
{value: 10 ,label: "10 уровень"},]
 },  
{name: "Уничтожайте зараженных", id: "infected", categoryId: "infected",
options:[
{value: 1, label: "Зараженные 1–6 ур"},
{value: 2, label: "Зараженные 7-12 ур"},
{value: 3, label: "Зараженные 13–18 ур"},
{value: 4, label: "Зараженные 19–24 ур"},
{value: 5, label: "Зараженные 25-30 ур"},]
},
 ],
dayOrder: ["mon","tue","wed","thu","fri","sat","sun"],
  days: { 
    mon: {
      name: "понедельник",
      turtle: [
{type: "category", id: "equipment"},
{type: "category", id: "troop_upgrade"},
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
  ]
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
{type: "action", id: "purchases"}, ]
    },
wed: {
      name: "среда",
      turtle: [
{type: "category", id: "titan"},
{type: "action", id: "research_1m"},
{type: "action", id: "purchases"},],
      vs: [
{type: "category", id: "titan"},
{type: "action", id: "vs_points"},
{type: "action", id: "research_1m"},
{type: "action", id: "research_power"},
{type: "action", id: "recon_wed"},
{type: "action", id: "purchases"}, ]
    },
thu: {
      name: "четверг",
      turtle: [
{type: "category", id: "heroes"},
{type: "action", id: "purchases"},],
      vs: [
{type: "category", id: "heroes"},
{type: "action", id: "purchases"}, ]
    },
fri: {
      name: "пятница",
      turtle: [
{type: "category", id: "equipment"},
{type: "category", id: "chief_collection"},
{type: "action", id: "purchases"},],
      vs: [
{type: "category", id: "troop_upgrade"},
{type: "category", id: "power"},
{type: "action", id: "research_1m"},
{type: "action", id: "building_1m"},
{type: "action", id: "training_1m"},
{type: "action", id: "recon_mon_fri"},
{type: "action", id: "purchases"}, ]
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
{type: "action", id: "purchases"},],
      vs: [
{type: "category", id: "titan"},
{type: "category", id: "speedups"},
{type: "action", id: "blue_hero_card"},
{type: "action", id: "purple_hero_card"},
{type: "action", id: "gold_hero_card"},
{type: "action", id: "hero_books"},
{type: "action", id: "dispatch_s"},
{type: "action", id: "truck_a"},
{type: "action", id: "purchases"}, ]
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
{type: "category", id: "infected"},
{type: "action", id: "purchases"}],
  vs: [ ]
      },
  },};
