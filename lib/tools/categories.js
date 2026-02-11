const CATEGORY_LIST = [
  {
    key: "dentistry",
    displayNameRu: "Стоматология",
    osmTagQueries: [
      { key: "amenity", value: "dentist" },
      { key: "healthcare", value: "dentist" }
    ],
    synonymsRu: ["стоматология", "стоматолог", "dental", "dentist"]
  },
  {
    key: "clinic",
    displayNameRu: "Клиника / Медцентр",
    osmTagQueries: [
      { key: "amenity", value: "clinic" },
      { key: "healthcare", value: "clinic" },
      { key: "healthcare", value: "doctor" }
    ],
    synonymsRu: ["клиника", "медцентр", "медицинский центр", "clinic"]
  },
  {
    key: "pharmacy",
    displayNameRu: "Аптека",
    osmTagQueries: [{ key: "amenity", value: "pharmacy" }],
    synonymsRu: ["аптека", "pharmacy"]
  },
  {
    key: "beauty_salon",
    displayNameRu: "Салон красоты",
    osmTagQueries: [
      { key: "shop", value: "beauty" },
      { key: "beauty", value: "salon" }
    ],
    synonymsRu: ["салон красоты", "beauty", "косметолог"]
  },
  {
    key: "barbershop",
    displayNameRu: "Барбершоп",
    osmTagQueries: [{ key: "shop", value: "hairdresser" }],
    synonymsRu: ["барбершоп", "barber", "парикмахерская"]
  },
  {
    key: "nail_salon",
    displayNameRu: "Ногти / Маникюр",
    osmTagQueries: [{ key: "beauty", value: "nails" }],
    synonymsRu: ["маникюр", "ногти", "nail"]
  },
  {
    key: "spa",
    displayNameRu: "СПА",
    osmTagQueries: [{ key: "leisure", value: "spa" }],
    synonymsRu: ["спа", "spa"]
  },
  {
    key: "fitness",
    displayNameRu: "Фитнес",
    osmTagQueries: [{ key: "leisure", value: "fitness_centre" }],
    synonymsRu: ["фитнес", "тренажерный", "gym", "fitness"]
  },
  {
    key: "yoga",
    displayNameRu: "Йога",
    osmTagQueries: [{ key: "sport", value: "yoga" }],
    synonymsRu: ["йога", "yoga"]
  },
  {
    key: "car_repair",
    displayNameRu: "Автосервис",
    osmTagQueries: [{ key: "shop", value: "car_repair" }],
    synonymsRu: ["автосервис", "сто", "car repair", "автосервис"]
  },
  {
    key: "car_wash",
    displayNameRu: "Мойка",
    osmTagQueries: [{ key: "amenity", value: "car_wash" }],
    synonymsRu: ["мойка", "car wash"]
  },
  {
    key: "tire_service",
    displayNameRu: "Шиномонтаж",
    osmTagQueries: [{ key: "shop", value: "tyres" }],
    synonymsRu: ["шиномонтаж", "шины", "tyres"]
  },
  {
    key: "restaurant",
    displayNameRu: "Ресторан",
    osmTagQueries: [{ key: "amenity", value: "restaurant" }],
    synonymsRu: ["ресторан", "restaurant"]
  },
  {
    key: "cafe",
    displayNameRu: "Кафе",
    osmTagQueries: [{ key: "amenity", value: "cafe" }],
    synonymsRu: ["кафе", "coffee", "cafe"]
  },
  {
    key: "bakery",
    displayNameRu: "Пекарня",
    osmTagQueries: [{ key: "shop", value: "bakery" }],
    synonymsRu: ["пекарня", "булочная", "bakery"]
  },
  {
    key: "hotel",
    displayNameRu: "Отель",
    osmTagQueries: [{ key: "tourism", value: "hotel" }],
    synonymsRu: ["отель", "hotel"]
  },
  {
    key: "hostel",
    displayNameRu: "Хостел",
    osmTagQueries: [{ key: "tourism", value: "hostel" }],
    synonymsRu: ["хостел", "hostel"]
  },
  {
    key: "kindergarten",
    displayNameRu: "Детский сад",
    osmTagQueries: [{ key: "amenity", value: "kindergarten" }],
    synonymsRu: ["детский сад", "садик", "kindergarten"]
  },
  {
    key: "school",
    displayNameRu: "Школа",
    osmTagQueries: [{ key: "amenity", value: "school" }],
    synonymsRu: ["школа", "school"]
  },
  {
    key: "tutoring",
    displayNameRu: "Репетиторы",
    osmTagQueries: [{ key: "office", value: "educational_institution" }],
    synonymsRu: ["репетитор", "tutor", "подготовка"]
  },
  {
    key: "veterinary",
    displayNameRu: "Ветклиника",
    osmTagQueries: [{ key: "amenity", value: "veterinary" }],
    synonymsRu: ["ветклиника", "ветеринар", "veterinary"]
  },
  {
    key: "dental_lab",
    displayNameRu: "Зуботехническая лаборатория",
    osmTagQueries: [{ key: "healthcare", value: "laboratory" }],
    synonymsRu: ["зуботех", "dental lab", "лаборатория"]
  },
  {
    key: "real_estate",
    displayNameRu: "Недвижимость",
    osmTagQueries: [{ key: "office", value: "estate_agent" }],
    synonymsRu: ["недвижимость", "риэлтор", "estate"]
  },
  {
    key: "law_firm",
    displayNameRu: "Юристы",
    osmTagQueries: [{ key: "office", value: "lawyer" }],
    synonymsRu: ["юрист", "адвокат", "law"]
  },
  {
    key: "accounting",
    displayNameRu: "Бухгалтерия",
    osmTagQueries: [{ key: "office", value: "accountant" }],
    synonymsRu: ["бухгалтер", "accounting"]
  },
  {
    key: "delivery",
    displayNameRu: "Доставка",
    osmTagQueries: [{ key: "office", value: "courier" }],
    synonymsRu: ["доставка", "курьер", "delivery"]
  },
  {
    key: "construction",
    displayNameRu: "Строительство",
    osmTagQueries: [{ key: "shop", value: "construction" }],
    synonymsRu: ["строительство", "стройматериалы", "ремонт"]
  },
  {
    key: "furniture",
    displayNameRu: "Мебель",
    osmTagQueries: [{ key: "shop", value: "furniture" }],
    synonymsRu: ["мебель", "furniture"]
  },
  {
    key: "electronics_repair",
    displayNameRu: "Ремонт техники",
    osmTagQueries: [{ key: "shop", value: "electronics_repair" }],
    synonymsRu: ["ремонт техники", "electronics repair"]
  },
  {
    key: "phone_repair",
    displayNameRu: "Ремонт телефонов",
    osmTagQueries: [{ key: "shop", value: "mobile_phone" }],
    synonymsRu: ["ремонт телефонов", "phone repair", "сервис телефонов"]
  }
];

const CATEGORY_BY_KEY = CATEGORY_LIST.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const CATEGORY_KEYS = CATEGORY_LIST.map((item) => item.key);

const findCategoryByText = (text) => {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const category of CATEGORY_LIST) {
    for (const synonym of category.synonymsRu) {
      if (lower.includes(synonym.toLowerCase())) {
        return category;
      }
    }
  }
  return null;
};

module.exports = {
  CATEGORY_LIST,
  CATEGORY_KEYS,
  CATEGORY_BY_KEY,
  findCategoryByText
};
