// Starting costs per product, taken from „Табло Печалба“ (its built-in list) and matched
// to the product names in ConvertBuilder. Gifts (price 0) are not counted separately –
// as in Табло, their cost is inside the main product. Check and edit in Settings.
export const START_PRODUCTS = [
  { name: "BeeVenom Care Gel 2+1", keys: "care gel 2+1,beevenom 2+1", cost: 17.89 },
  { name: "BeeVenom Care Gel 3 бр.", keys: "care gel 3 бр,care gel 3бр", cost: 35.37 },
  { name: "BeeVenom 3+2 (пакет)", keys: "beevenom 3+2,care gel 3+2,пакет 3+2", cost: 24.89 },
  { name: "BeeVenom Care Gel", keys: "care gel,beevenom", cost: 12.37 },
  { name: "Крем пчелна отрова 30 г", keys: "крем за стави 30,крем 1 бр", cost: 10.11 },
  { name: "Крем пчелна отрова 2+1", keys: "крем за стави 2+1,2+1 бурканчета", cost: 19.8 },
  { name: "Крем пчелна отрова 3+2", keys: "крем за стави 3+2,3+2 бурканчета", cost: 24.89 },
  { name: "Пластири с пчелна отрова", keys: "пластири с пчелна,tapaszok,náplasti,obliži,билкови пластири", cost: 5.9 },
  { name: "Спрей", keys: "спрей", cost: 5.9 },
  { name: "Хиалуронов крем", keys: "хиалурон", cost: 17.9 },
  { name: "Крем конски кестен", keys: "кестен", cost: 5.9 },
  { name: "Образователни карти НВО", keys: "карти", cost: 22.18 },
  { name: "Пробна матура / тест PDF", keys: "pdf,матура,тест", cost: 5.3 },
  { name: "30 въпроса литература", keys: "30 въпроса", cost: 4.69 },
];
