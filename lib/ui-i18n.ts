import type { POI } from "./types";
export type Locale = "ru" | "kk" | "en";
export const LOCALES: readonly Locale[] = ["ru", "kk", "en"];
const ru: Record<string, string> = {
brand:"Seruen",tagline:"Ваш город. Ваш ритм.",navDiscover:"Открыть Астану",navCinema:"Кино",navEvents:"События",navHow:"Как это работает",language:"Язык",themeDark:"Тёмная тема",themeLight:"Светлая тема",themeSystem:"Как в системе",startQuiz:"Найти свой маршрут",editPreferences:"Изменить предпочтения",quizEyebrow:"ПРОГУЛКА ПОД ВАШЕ НАСТРОЕНИЕ",quizTitle:"Какой будет ваша Астана?",moodQuestion:"Чего хочется сегодня?",moodAny:"Удивите меня",moodNature:"Природы и тишины",moodCulture:"Культуры и открытий",moodCoffee:"Хорошего кофе",moodFamily:"Впечатлений для детей",moodPhoto:"Красивых видов",companyQuestion:"С кем вы гуляете?",companySolo:"Самостоятельно",companyCouple:"Вдвоём",companyFriends:"С друзьями",companyFamily:"С семьёй",people:"Человек",spaceQuestion:"Где вам комфортнее?",spaceAny:"Везде",spaceOutdoor:"На свежем воздухе",spaceIndoor:"В помещении",budgetQuestion:"Какой бюджет на человека?",budgetFree:"Бесплатные места",budgetLow:"До 3 000 ₸",budgetMedium:"До 10 000 ₸",budgetFlexible:"Без ограничений",perPerson:"на человека",currency:"₸",foodQuestion:"Добавим что-нибудь вкусное?",foodYes:"Да, хочу перекусить",foodNo:"Пока без еды",next:"Далее",back:"Назад",finish:"Открыть мою Астану",skip:"Пропустить",stepOf:"Шаг {step} из {total}",timeQuestion:"Сколько у вас времени?",minutes:"мин",hours:"ч",location:"Точка старта",geolocate:"Моя геолокация",geolocationPrivacy:"Локация — по желанию. Историю не храним.",queryPlaceholder:"Тихое место у воды, кофе с собой или что-то новое…",search:"Подобрать прогулку",loading:"Ищем ваш ритм…",resultsTitle:"Есть повод выйти.",resultsIntro:"Места под ваши интересы, время и погоду.",catalogueTitle:"У каждого места — свой ритм.",saved:"Избранное",savedEmpty:"Здесь появятся места, которые вы сохраните.",save:"Сохранить",unsave:"Удалить из избранного",visitMinutes:"мин на визит",walkMinutes:"мин пешком",distance:"Расстояние",why:"Почему вам подойдёт",whatToDo:"Что делать",source:"Источник",hoursUnknown:"Часы не подтверждены — уточните перед визитом",ratingUnknown:"Нет подтверждённого рейтинга",approximate:"Ориентировочно",view2gis:"Открыть в 2ГИС",viewSource:"Перейти к источнику",liveBadge:"АКТУАЛЬНЫЕ ДАННЫЕ",unavailableBadge:"НЕДОСТУПНО",connectedBadge:"ПОДКЛЮЧЕНО",notConfigured:"Источник ещё не подключён",cinemaTitle:"Большой экран. Ваш вечер.",cinemaSubtitle:"Сеансы в Астане из подключённого источника. Время и цены проверяйте перед покупкой.",eventsTitle:"Город в движении.",eventsSubtitle:"Концерты, выставки и события Астаны.",today:"Сегодня",tomorrow:"Завтра",showtimes:"Сеансы",ticketFrom:"Билеты от",priceUnknown:"Цену уточняйте у организатора",cinema:"Кинотеатр",mall:"Торговый центр",synopsis:"О фильме",book:"Купить билет",viewEvent:"Открыть событие",eventTime:"Время события",trafficTitle:"Дорожная обстановка",trafficUnavailable:"Пробки не подключены — время в пути ориентировочное",trafficScale:"Загруженность дорог",mapConsent:"Интерактивная карта загружается из внешнего сервиса. Он получит ваш IP-адрес и область просмотра.",mapLoad:"Загрузить карту",mapProvider:"Источник карты",mapFallback:"Карта недоступна. Откройте место в 2ГИС.",weatherLive:"Текущая погода",weatherSummer:"Лето · демо",weatherWinter:"Зима · демо",demo:"ДЕМО",live:"LIVE",indoorOnly:"Только в помещении",privacyTitle:"Ваша локация — ваш выбор.",privacyText:"Геолокация запрашивается только по вашей кнопке. Приложение не сохраняет историю точных координат. Избранное хранит только идентификаторы мест в этом браузере.",howTitle:"Реальные места. Понятные советы.",howText:"Сначала система ищет места в каталоге и проверяет ограничения по погоде, времени и интересам. Затем составляет рекомендации на основе найденных записей. Неизвестные часы, цены и рейтинги не выдумываются.",externalLinks:"Знакомые сервисы",refresh:"Обновить",close:"Закрыть",errorRetry:"Не удалось загрузить данные. Попробуйте ещё раз.",emptyCinema:"Подтверждённые сеансы пока не получены. Откройте актуальную афишу кинотеатра.",emptyEvents:"Подтверждённые события пока не получены. Проверьте афишу организатора.",preferencesSummary:"Ваши предпочтения",recommendationTemplate:"Поиск + шаблон",recommendationLlm:"Поиск + ИИ",safetyNotice:"Перед выходом проверьте часы работы, доступность и фактический путь. Расстояния и время ориентировочные.",freeNotConfirmed:"Бесплатный вход не подтверждён",noExactLocationStored:"Точную локацию не сохраняем",footer:"Шаг за шагом — ближе к городу.",all:"Все",filters:"Фильтры",openNow:"Открыто сейчас",unknown:"Нет данных",leftBank:"Левый берег",rightBank:"Правый берег",inside:"В помещении",outside:"На воздухе",illustration:"Иллюстрация",map:"Карта",list:"Список",catalogue:"Каталог",settings:"Настройки",reset:"Сбросить",cancel:"Отмена",apply:"Применить",food:"Еда",budget:"Бюджет",company:"Компания",mood:"Настроение",visit:"Посещение",address:"Адрес",openingHours:"Часы работы",rating:"Рейтинг",collectedAt:"Дата записи",coordinateSource:"Координаты",goBack:"Вернуться",noResults:"В этих условиях подходящих мест нет",tryDifferent:"Попробуйте другую точку старта или больше времени.",viewAll:"Смотреть все",warmRoute:"Тёплая прогулка",freshAir:"На свежем воздухе",welcome:"Знакомый город. Новые открытия.",heroTitle:"Астана. В вашем ритме.",heroCopy:"Свободный час — уже маленькое путешествие. Найдите своё место в городе.",preferencesSaved:"Предпочтения обновлены",savedSuccess:"Место сохранено",removedSuccess:"Место удалено из избранного",externalService:"Внешний сервис",recheckDetails:"Уточните детали перед визитом",noTickets:"Билеты не подтверждены",allDates:"Все даты",anyTime:"Любое время",transport:"Транспорт",walking:"Пешком",weather:"Погода",feelsLike:"Ощущается",wind:"Ветер",kmh:"км/ч",km:"км",meters:"м"
};
const kk: Record<string, string> = {
brand:"Seruen",tagline:"Өз қалаңыз. Өз ырғағыңыз.",navDiscover:"Астананы таныңыз",navCinema:"Кино",navEvents:"Іс-шаралар",navHow:"Қалай жұмыс істейді",language:"Тіл",themeDark:"Қараңғы тақырып",themeLight:"Жарық тақырып",themeSystem:"Жүйедегідей",startQuiz:"Өз бағытымды табу",editPreferences:"Қалауды өзгерту",quizEyebrow:"КӨҢІЛ КҮЙІҢІЗГЕ САЙ СЕРУЕН",quizTitle:"Бүгінгі Астанаңыз қандай болады?",moodQuestion:"Бүгін не қалайсыз?",moodAny:"Таңғалдырыңыз",moodNature:"Табиғат пен тыныштық",moodCulture:"Мәдениет пен жаңалық",moodCoffee:"Дәмді кофе",moodFamily:"Балаларға қызықты орын",moodPhoto:"Әсем көріністер",companyQuestion:"Кіммен серуендейсіз?",companySolo:"Жалғыз",companyCouple:"Екеуміз",companyFriends:"Достармен",companyFamily:"Отбасымен",people:"Адам саны",spaceQuestion:"Қай жерде жайлы?",spaceAny:"Кез келген жерде",spaceOutdoor:"Ашық ауада",spaceIndoor:"Ғимарат ішінде",budgetQuestion:"Бір адамға қанша жұмсамақсыз?",budgetFree:"Тегін орындар",budgetLow:"3 000 ₸ дейін",budgetMedium:"10 000 ₸ дейін",budgetFlexible:"Шектеусіз",perPerson:"бір адамға",currency:"₸",foodQuestion:"Дәмді ас қосамыз ба?",foodYes:"Иә, тамақтанғым келеді",foodNo:"Әзірге тамақсыз",next:"Келесі",back:"Артқа",finish:"Өз Астанамды ашу",skip:"Өткізіп жіберу",stepOf:"{total} қадамның {step}-қадамы",timeQuestion:"Қанша уақытыңыз бар?",minutes:"мин",hours:"сағ",location:"Бастапқы нүкте",geolocate:"Орналасқан жерім",geolocationPrivacy:"Геолокация өз қалауыңызбен. Тарихты сақтамаймыз.",queryPlaceholder:"Су жағасындағы тыныш орын, алып кететін кофе немесе жаңа әсер…",search:"Серуен таңдау",loading:"Сізге сай орын іздеудеміз…",resultsTitle:"Серуендеуге себеп табылды.",resultsIntro:"Қызығушылығыңызға, уақытыңызға және ауа райына сай орындар.",catalogueTitle:"Әр орынның өз ырғағы бар.",saved:"Таңдаулылар",savedEmpty:"Сақтаған орындарыңыз осында пайда болады.",save:"Сақтау",unsave:"Таңдаулылардан өшіру",visitMinutes:"мин баруға",walkMinutes:"мин жаяу",distance:"Қашықтық",why:"Неліктен сізге сай",whatToDo:"Не істеуге болады",source:"Дереккөз",hoursUnknown:"Жұмыс уақыты расталмаған — барар алдында тексеріңіз",ratingUnknown:"Расталған рейтинг жоқ",approximate:"Шамамен",view2gis:"2GIS-те ашу",viewSource:"Дереккөзді ашу",liveBadge:"ӨЗЕКТІ ДЕРЕКТЕР",unavailableBadge:"ҚОЛЖЕТІМСІЗ",connectedBadge:"ҚОСЫЛҒАН",notConfigured:"Дереккөз әлі қосылмаған",cinemaTitle:"Үлкен экран. Сіздің кешіңіз.",cinemaSubtitle:"Қосылған дереккөздегі Астана сеанстары. Сатып алар алдында уақыт пен бағаны тексеріңіз.",eventsTitle:"Қала өмірі қайнауда.",eventsSubtitle:"Астанадағы концерттер, көрмелер мен іс-шаралар.",today:"Бүгін",tomorrow:"Ертең",showtimes:"Сеанстар",ticketFrom:"Билет бағасы",priceUnknown:"Бағаны ұйымдастырушыдан нақтылаңыз",cinema:"Кинотеатр",mall:"Сауда орталығы",synopsis:"Фильм туралы",book:"Билет сатып алу",viewEvent:"Іс-шараны ашу",eventTime:"Өтетін уақыты",trafficTitle:"Жолдағы жағдай",trafficUnavailable:"Кептеліс деректері қосылмаған — жол уақыты шамамен берілген",trafficScale:"Жол жүктемесі",mapConsent:"Интерактивті карта сыртқы сервистен жүктеледі. Ол IP-мекенжайыңызды және қаралған аймақты алады.",mapLoad:"Картаны жүктеу",mapProvider:"Карта дереккөзі",mapFallback:"Карта қолжетімсіз. Орынды 2GIS-те ашыңыз.",weatherLive:"Қазіргі ауа райы",weatherSummer:"Жаз · демо",weatherWinter:"Қыс · демо",demo:"ДЕМО",live:"LIVE",indoorOnly:"Тек ғимарат ішінде",privacyTitle:"Орналасқан жеріңізді өзіңіз таңдайсыз.",privacyText:"Геолокация тек батырманы басқанда сұралады. Қолданба нақты координаттар тарихын сақтамайды. Таңдаулыларда тек орындардың идентификаторлары осы браузерде сақталады.",howTitle:"Нақты орындар. Түсінікті кеңестер.",howText:"Жүйе алдымен каталогтан орын іздеп, ауа райын, уақытты және қызығушылықты ескереді. Содан кейін табылған деректер негізінде ұсыныс жасайды. Белгісіз жұмыс уақыты, баға мен рейтинг ойдан шығарылмайды.",externalLinks:"Таныс сервистер",refresh:"Жаңарту",close:"Жабу",errorRetry:"Деректерді жүктеу мүмкін болмады. Қайта көріңіз.",emptyCinema:"Расталған сеанстар әлі алынған жоқ. Кинотеатрдың өзекті афишасын ашыңыз.",emptyEvents:"Расталған іс-шаралар әлі алынған жоқ. Ұйымдастырушының афишасын тексеріңіз.",preferencesSummary:"Сіздің қалауыңыз",recommendationTemplate:"Іздеу + үлгі",recommendationLlm:"Іздеу + ЖИ",safetyNotice:"Жолға шығар алдында жұмыс уақытын, қолжетімділікті және нақты бағытты тексеріңіз. Қашықтық пен уақыт шамамен берілген.",freeNotConfirmed:"Тегін кіру расталмаған",noExactLocationStored:"Нақты орналасқан жерді сақтамаймыз",footer:"Әр қадаммен қалаға жақындай түсіңіз.",all:"Барлығы",filters:"Сүзгілер",openNow:"Қазір ашық",unknown:"Дерек жоқ",leftBank:"Сол жағалау",rightBank:"Оң жағалау",inside:"Ғимарат ішінде",outside:"Ашық ауада",illustration:"Иллюстрация",map:"Карта",list:"Тізім",catalogue:"Каталог",settings:"Баптаулар",reset:"Тазарту",cancel:"Бас тарту",apply:"Қолдану",food:"Тамақ",budget:"Бюджет",company:"Серіктестер",mood:"Көңіл күй",visit:"Бару",address:"Мекенжай",openingHours:"Жұмыс уақыты",rating:"Рейтинг",collectedAt:"Жазба күні",coordinateSource:"Координаттар",goBack:"Қайту",noResults:"Бұл шарттарға сай орын табылмады",tryDifferent:"Басқа бастапқы нүктені немесе көбірек уақытты таңдаңыз.",viewAll:"Барлығын көру",warmRoute:"Жылы серуен",freshAir:"Таза ауада",welcome:"Таныс қала. Жаңа әсерлер.",heroTitle:"Астана. Өз ырғағыңызбен.",heroCopy:"Бос бір сағаттың өзі — шағын саяхат. Қаладағы өз орныңызды табыңыз.",preferencesSaved:"Қалауыңыз жаңартылды",savedSuccess:"Орын сақталды",removedSuccess:"Орын таңдаулылардан өшірілді",externalService:"Сыртқы сервис",recheckDetails:"Барар алдында мәліметті нақтылаңыз",noTickets:"Билеттер расталмаған",allDates:"Барлық күндер",anyTime:"Кез келген уақыт",transport:"Көлік",walking:"Жаяу",weather:"Ауа райы",feelsLike:"Сезіледі",wind:"Жел",kmh:"км/сағ",km:"км",meters:"м"
};
const en: Record<string, string> = {
brand:"Seruen",tagline:"Your city. Your pace.",navDiscover:"Discover Astana",navCinema:"Cinema",navEvents:"Events",navHow:"How it works",language:"Language",themeDark:"Dark theme",themeLight:"Light theme",themeSystem:"System theme",startQuiz:"Find my route",editPreferences:"Edit preferences",quizEyebrow:"A WALK FOR YOUR MOOD",quizTitle:"What will your Astana look like?",moodQuestion:"What are you in the mood for?",moodAny:"Surprise me",moodNature:"Nature and quiet",moodCulture:"Culture and discovery",moodCoffee:"Great coffee",moodFamily:"Fun for the children",moodPhoto:"Beautiful views",companyQuestion:"Who are you exploring with?",companySolo:"On my own",companyCouple:"As a couple",companyFriends:"With friends",companyFamily:"With family",people:"People",spaceQuestion:"Where do you feel most comfortable?",spaceAny:"Anywhere",spaceOutdoor:"Outdoors",spaceIndoor:"Indoors",budgetQuestion:"What is your budget per person?",budgetFree:"Free places",budgetLow:"Up to ₸3,000",budgetMedium:"Up to ₸10,000",budgetFlexible:"Flexible",perPerson:"per person",currency:"₸",foodQuestion:"Shall we add something tasty?",foodYes:"Yes, a bite to eat",foodNo:"No food for now",next:"Next",back:"Back",finish:"Discover my Astana",skip:"Skip",stepOf:"Step {step} of {total}",timeQuestion:"How much time do you have?",minutes:"min",hours:"hr",location:"Starting point",geolocate:"Use my location",geolocationPrivacy:"Location is optional. We do not keep a history.",queryPlaceholder:"Somewhere quiet by the water, coffee to go, or something new…",search:"Find my walk",loading:"Finding your pace…",resultsTitle:"A reason to head out.",resultsIntro:"Places for your interests, available time, and the weather.",catalogueTitle:"Every place has its own rhythm.",saved:"Saved places",savedEmpty:"The places you save will appear here.",save:"Save",unsave:"Remove from saved",visitMinutes:"min to visit",walkMinutes:"min on foot",distance:"Distance",why:"Why it suits you",whatToDo:"What to do",source:"Source",hoursUnknown:"Hours are unconfirmed — check before visiting",ratingUnknown:"No verified rating",approximate:"Approximate",view2gis:"Open in 2GIS",viewSource:"View source",liveBadge:"LIVE DATA",unavailableBadge:"UNAVAILABLE",connectedBadge:"CONNECTED",notConfigured:"This source is not connected yet",cinemaTitle:"A big screen. Your evening.",cinemaSubtitle:"Astana showtimes from a connected source. Check times and prices before booking.",eventsTitle:"The city is happening.",eventsSubtitle:"Concerts, exhibitions, and events in Astana.",today:"Today",tomorrow:"Tomorrow",showtimes:"Showtimes",ticketFrom:"Tickets from",priceUnknown:"Check the price with the organiser",cinema:"Cinema",mall:"Shopping centre",synopsis:"Synopsis",book:"Book a ticket",viewEvent:"View event",eventTime:"Event time",trafficTitle:"Traffic conditions",trafficUnavailable:"Live traffic is not connected — travel times are estimates",trafficScale:"Road congestion",mapConsent:"The interactive map loads from an external provider, which receives your IP address and viewed area.",mapLoad:"Load map",mapProvider:"Map provider",mapFallback:"The map is unavailable. Open the place in 2GIS.",weatherLive:"Current weather",weatherSummer:"Summer · demo",weatherWinter:"Winter · demo",demo:"DEMO",live:"LIVE",indoorOnly:"Indoors only",privacyTitle:"Your location. Your choice.",privacyText:"Location is requested only when you press the button. The app does not store a history of precise coordinates. Saved places contain only place IDs in this browser.",howTitle:"Real places. Clear suggestions.",howText:"The system first retrieves places from the catalogue and checks weather, time, and interests. It then builds recommendations from the retrieved records. Unknown hours, prices, and ratings are never invented.",externalLinks:"Familiar services",refresh:"Refresh",close:"Close",errorRetry:"Could not load the data. Please try again.",emptyCinema:"Verified showtimes have not been received yet. Open the cinema’s current listings.",emptyEvents:"Verified events have not been received yet. Check the organiser’s listings.",preferencesSummary:"Your preferences",recommendationTemplate:"Search + template",recommendationLlm:"Search + AI",safetyNotice:"Check opening hours, accessibility, and the actual route before heading out. Distances and times are approximate.",freeNotConfirmed:"Free admission is not confirmed",noExactLocationStored:"We do not store your precise location",footer:"One step closer to your city.",all:"All",filters:"Filters",openNow:"Open now",unknown:"No data",leftBank:"Left bank",rightBank:"Right bank",inside:"Indoors",outside:"Outdoors",illustration:"Illustration",map:"Map",list:"List",catalogue:"Catalogue",settings:"Settings",reset:"Reset",cancel:"Cancel",apply:"Apply",food:"Food",budget:"Budget",company:"Company",mood:"Mood",visit:"Visit",address:"Address",openingHours:"Opening hours",rating:"Rating",collectedAt:"Record date",coordinateSource:"Coordinates",goBack:"Go back",noResults:"No places match these conditions",tryDifferent:"Try another starting point or allow more time.",viewAll:"View all",warmRoute:"A warm walk",freshAir:"Fresh air",welcome:"A familiar city. New discoveries.",heroTitle:"Astana. At your own pace.",heroCopy:"A spare hour is a little adventure. Find your own place in the city.",preferencesSaved:"Preferences updated",savedSuccess:"Place saved",removedSuccess:"Place removed from saved",externalService:"External service",recheckDetails:"Check the details before visiting",noTickets:"Tickets are unconfirmed",allDates:"All dates",anyTime:"Any time",transport:"Transport",walking:"Walking",weather:"Weather",feelsLike:"Feels like",wind:"Wind",kmh:"km/h",km:"km",meters:"m"
};
export const copy: Record<Locale, Record<string, string>> = { ru, kk, en };
export function t(locale: Locale): Record<string, string> { return copy[locale] ?? copy.ru; }
const categoryTranslations: Record<string, {kk:string;en:string}> = {
"Парк":{kk:"Саябақ",en:"Park"},"Музей":{kk:"Мұражай",en:"Museum"},"Кофейня":{kk:"Кофехана",en:"Coffee shop"},"Кафе":{kk:"Кафе",en:"Café"},"Ресторан":{kk:"Мейрамхана",en:"Restaurant"},"Торговый центр":{kk:"Сауда орталығы",en:"Shopping centre"},"Кинотеатр":{kk:"Кинотеатр",en:"Cinema"},"Набережная":{kk:"Жағалау",en:"Waterfront"},"Архитектура":{kk:"Сәулет",en:"Architecture"},"Достопримечательность":{kk:"Көрікті орын",en:"Landmark"},"Монумент":{kk:"Монумент",en:"Monument"},"Памятник":{kk:"Ескерткіш",en:"Monument"},"Театр":{kk:"Театр",en:"Theatre"},"Мечеть":{kk:"Мешіт",en:"Mosque"},"Площадь":{kk:"Алаң",en:"Square"},"Библиотека":{kk:"Кітапхана",en:"Library"},"Галерея":{kk:"Галерея",en:"Gallery"},"Ботанический сад":{kk:"Ботаникалық бақ",en:"Botanical garden"},"Развлечения":{kk:"Ойын-сауық",en:"Entertainment"},"Культура":{kk:"Мәдениет",en:"Culture"},"Прогулка":{kk:"Серуен",en:"Walk"},"Смотровая площадка":{kk:"Шолу алаңы",en:"Viewing platform"},"Спорт":{kk:"Спорт",en:"Sport"},"Выставочный центр":{kk:"Көрме орталығы",en:"Exhibition centre"}
};
type PlaceTranslation = {name?:string;description:string};
export const placeTranslations: Record<string, {kk:PlaceTranslation;en:PlaceTranslation}> = {};
export function localizedPOI<T extends POI>(poi:T, locale:Locale):T {
  if(locale==="ru") return poi;
  const translated=placeTranslations[poi.id]?.[locale];
  const category=categoryTranslations[poi.category]?.[locale] ?? (locale==="kk"?"Қаладағы орын":"City attraction");
  const fallback=locale==="kk"?`${poi.name} — Астанадағы ${poi.indoor?"ғимарат ішіндегі":"ашық ауадағы"} орын. Мекенжайы, жұмыс уақыты және кіру шарттарын барар алдында дереккөзден нақтылаңыз.`:`${poi.name} is an ${poi.indoor?"indoor":"outdoor"} place in Astana. Check the address, opening hours, and entry conditions with the source before visiting.`;
  return {...poi,name:translated?.name??poi.name,description:translated?.description??fallback,category};
}
Object.assign(categoryTranslations, {
  "Выставочный павильон":{kk:"Көрме павильоны",en:"Exhibition pavilion"},
  "История":{kk:"Тарихи орын",en:"Historic site"}
});
Object.assign(placeTranslations, {
  "baiterek":{
    kk:{name:"Бәйтерек",description:"Елорда көрінісін тамашалауға арналған шолу алаңы бар монумент."},
    en:{name:"Baiterek",description:"A monument with a viewing platform and panoramic views of the capital."}
  },
  "nurzhol":{
    kk:{name:"Нұржол бульвары",description:"Сол жағалаудың заманауи сәулет нысандары арасындағы жаяу жүргіншілер бульвары."},
    en:{name:"Nurzhol Boulevard",description:"A pedestrian boulevard among the modern buildings of the left bank."}
  },
  "khan-shatyr":{
    kk:{name:"Хан Шатыр",description:"Шатыр астындағы сауда және ойын-сауық орталығы: дүкендер, кафелер және отбасылық демалыс."},
    en:{name:"Khan Shatyr",description:"A tent-shaped shopping and entertainment centre with shops, cafés, and family activities."}
  },
  "mega-silk-way":{
    kk:{name:"MEGA Silk Way",description:"EXPO маңындағы кафелері, кинотеатры және отбасылық кеңістіктері бар сауда орталығы."},
    en:{name:"MEGA Silk Way",description:"A shopping centre near EXPO with cafés, a cinema, and family spaces."}
  },
  "nur-alem":{
    kk:{name:"alem.ai · Сингулярлық мұражайы",description:"alem.ai ғимаратының бірінші қабатындағы Сингулярлық мұражайы. Бұрынғы Болашақ энергиясы мұражайы 2024 жылғы желтоқсанда келушілерді қабылдауды тоқтатты. Қазіргі кіру шарттарын орталықтан нақтылаңыз."},
    en:{name:"alem.ai · Singularity Museum",description:"The Singularity Museum on the first floor of alem.ai. The former Future Energy Museum stopped receiving visitors in December 2024. Check current access with the centre."}
  },
  "national-museum":{
    kk:{name:"Қазақстан Республикасының Ұлттық мұражайы",description:"Қазақстан тарихы, мәдениеті, этнографиясы мен өнеріне арналған мұражай."},
    en:{name:"National Museum of Kazakhstan",description:"A museum of Kazakhstan’s history, culture, ethnography, and art."}
  },
  "botanical-garden":{
    kk:{name:"Ботаникалық бақ",description:"Тыныш серуенге арналған жасыл кеңістік. Жылыжайдың келушілерді қабылдау тәртібі бөлек."},
    en:{name:"Botanical Garden",description:"A green space for a peaceful walk. The greenhouse has separate visiting arrangements."}
  },
  "astana-opera":{
    kk:{name:"Астана Опера",description:"Опера және балет театры. Қойылымға бару үшін афишаға сәйкес жеке билет қажет."},
    en:{name:"Astana Opera",description:"An opera and ballet theatre. Attending a performance requires a separate ticket for a scheduled show."}
  },
  "astana-ballet":{
    kk:{name:"Астана Балет",description:"Балет қойылымдары өтетін театр. Барар алдында афишаны және билеттердің бар-жоғын тексеріңіз."},
    en:{name:"Astana Ballet",description:"A ballet theatre. Check the programme and ticket availability before visiting."}
  },
  "peace-palace":{
    kk:{name:"Бейбітшілік және келісім сарайы",description:"Пирамида пішініндегі ғимарат — елорданың сәулеттік көрікті орындарының бірі."},
    en:{name:"Palace of Peace and Reconciliation",description:"A pyramid-shaped building and one of the capital’s architectural landmarks."}
  },
  "hazret-sultan":{
    kk:{name:"Әзірет Сұлтан мешіті",description:"Тәуелсіздік алаңы маңындағы мешіт. Келушілерге арналған ережелерді сақтап, намаз уақытын ескеріңіз."},
    en:{name:"Hazret Sultan Mosque",description:"A mosque near Independence Square. Follow visitor rules and take prayer times into account."}
  },
  "grand-mosque":{
    kk:{name:"Астананың Бас мешіті",description:"Республикалық бас мешіт. Кірер алдында келушілерге арналған ережелермен танысыңыз."},
    en:{name:"Astana Grand Mosque",description:"The country’s main mosque. Read the visitor rules before entering."}
  },
  "triumphal-arch":{
    kk:{name:"Мәңгілік Ел салтанат қақпасы",description:"Мәңгілік Ел даңғылындағы сәулет ескерткіші, қысқа фотосеруенге арналған орын."},
    en:{name:"Mangilik El Triumphal Arch",description:"An architectural monument on Mangilik El Avenue for a short photo walk."}
  },
  "central-park":{
    kk:{name:"Орталық саябақ",description:"Өзен маңындағы демалыс пен серуенге арналған қалалық саябақ."},
    en:{name:"Central Park",description:"A city park by the river for relaxing and walking."}
  },
  "embankment":{
    kk:{name:"Есіл жағалауы",description:"Өзен бойындағы серуендеуге және ескі қаланы суретке түсіруге арналған ашық кеңістік."},
    en:{name:"Esil Embankment",description:"An open riverside space for walking and photographing the old city."}
  },
  "gorky-theatre":{
    kk:{name:"М. Горький атындағы орыс драма театры",description:"Қаланың тарихи бөлігіндегі театр. Қойылымдарға кесте бойынша және билетпен кіруге болады."},
    en:{name:"Gorky Russian Drama Theatre",description:"A theatre in the historic part of the city. Performances follow a schedule and require tickets."}
  },
  "kenesary":{
    kk:{name:"Кенесары хан ескерткіші",description:"Жағалаудағы атты ескерткіш — тарихи орталықпен танысуға арналған нүкте."},
    en:{name:"Kenesary Khan Monument",description:"An equestrian monument on the embankment, a starting point for discovering the historic centre."}
  },
  "kazakh-eli":{
    kk:{name:"Қазақ елі монументі",description:"Тәуелсіздік алаңындағы мұражай мен сәулет нысандарының жанында орналасқан монумент."},
    en:{name:"Kazakh Eli Monument",description:"A monument on Independence Square near the museum and architectural landmarks."}
  },
  "keruen":{
    kk:{name:"Керуен",description:"Нұржол бульварындағы сауда орталығы — ғимарат ішінде қысқа аялдауға болатын орын."},
    en:{name:"Keruen",description:"A shopping centre on Nurzhol Boulevard, an option for a short indoor stop."}
  },
  "kubrin-house":{
    kk:{name:"Көпес Кубриннің үйі",description:"Ескі қаладағы тарихи ғимарат. Қасбетін қоғамдық көшеден тамашалауды жоспарлаңыз."},
    en:{name:"Merchant Kubrin’s House",description:"A historic building in the old city. Plan to view the façade from the public street."}
  },
  "kulanshi":{
    kk:{name:"Forte Kulanshi Art Space",description:"Заманауи өнер кеңістігі. Қазіргі көрме мен кіру тәртібін нақтылаңыз."},
    en:{name:"Forte Kulanshi Art Space",description:"A contemporary art space. Check the current exhibition and entry conditions."}
  },
  "ulytau-alley":{
    kk:{name:"Ұлытау аллеясы",description:"Асықпай серуендеуге және суретке түсуге арналған жаяу жүргіншілер кеңістігі."},
    en:{name:"Ulytau Alley",description:"A pedestrian public space for a relaxed walk and photos."}
  },
  "discovery-coffee":{
    kk:{name:"Discovery Coffee · Кенесары",description:"Қалалық гастрогидке енген кофехана. Барар алдында мекенжайы мен ас мәзірін тексеріңіз."},
    en:{name:"Discovery Coffee · Kenesary",description:"A coffee shop listed in the city’s food guide. Check the address and menu before visiting."}
  },
  "bon-bon":{
    kk:{name:"Bon Bon · Қонаев",description:"Нұржол бульвары маңындағы қалалық гастрогидке енген кофехана."},
    en:{name:"Bon Bon · Konaev",description:"A coffee shop near Nurzhol Boulevard, listed in the city’s food guide."}
  },
  "wiki-31388841":{
    kk:{name:"Ұлттық академиялық кітапхана",description:"Қоғамдық көшеден қала сәулетімен қысқаша танысуға болатын орын. Ғимарат ішіне кіру көзделмейді."},
    en:{name:"National Academic Library",description:"A stop to view the city’s architecture from the public street. Entry to the building is not included."}
  },
  "wiki-65714153":{
    kk:{name:"Жетісу саябағы",description:"Таза ауада асықпай серуендеуге арналған қалалық саябақ. Кіру жолдарының қолжетімділігін картадан тексеріңіз."},
    en:{name:"Zhetisu Park",description:"A city park for a leisurely walk outdoors. Check the accessible entrances on a map."}
  },
  "wiki-62815244":{
    kk:{name:"Дөңгелек алаң",description:"Қоғамдық көшеден қала сәулетімен қысқаша танысуға болатын орын. Ғимараттардың ішіне кіру көзделмейді."},
    en:{name:"Round Square",description:"A stop to view the city’s architecture from public space. Entry to the surrounding buildings is not included."}
  },
  "wiki-24284325":{
    kk:{name:"Нұр-Астана мешіті",description:"Мешіт сәулетін қоғамдық көшеден тамашалауға арналған нүкте. Ғимарат ішіне кіру көзделмейді."},
    en:{name:"Nur-Astana Mosque",description:"A stop to view the mosque’s architecture from the public street. Entry to the building is not included."}
  },
  "wiki-62820991":{
    kk:{name:"Ғашықтар саябағы",description:"Таза ауада асықпай серуендеуге арналған қалалық саябақ. Кіру жолдарының қолжетімділігін картадан тексеріңіз."},
    en:{name:"Lovers’ Park",description:"A city park for a leisurely walk outdoors. Check the accessible entrances on a map."}
  },
  "wiki-65712361":{
    kk:{name:"Триатлон саябағы",description:"Таза ауада асықпай серуендеуге арналған қалалық саябақ. Кіру жолдарының қолжетімділігін картадан тексеріңіз."},
    en:{name:"Triathlon Park",description:"A city park for a leisurely walk outdoors. Check the accessible entrances on a map."}
  },
  "wiki-65703042":{
    kk:{name:"Президенттік саябақ",description:"Таза ауада асықпай серуендеуге арналған қалалық саябақ. Кіру жолдарының қолжетімділігін картадан тексеріңіз."},
    en:{name:"Presidential Park",description:"A city park for a leisurely walk outdoors. Check the accessible entrances on a map."}
  },
  "wiki-63707654":{
    kk:{name:"Отан қорғаушылар монументі",description:"Қоғамдық көшеден қала сәулетімен қысқаша танысуға болатын орын. Жабық нысандарға кіру көзделмейді."},
    en:{name:"Defenders of the Fatherland Monument",description:"A stop to view the city’s monuments from public space. Entry to enclosed facilities is not included."}
  },
  "wiki-68030640":{
    kk:{name:"Demalys Promenade",description:"Қоғамдық кеңістіктен қала сәулетімен қысқаша танысуға болатын серуен орны. Ғимараттардың ішіне кіру көзделмейді."},
    en:{name:"Demalys Promenade",description:"A walking spot to view the city’s architecture from public space. Entry to surrounding buildings is not included."}
  }
});
