import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';
import * as firebase from 'firebase-admin/app';
import * as firestore from 'firebase-admin/firestore';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

const BROWSER_WIDTH = 1200;
const BROWSER_HEIGHT = 720;

const DUBIZZLE_LOGIN = 'adssharmaxmotors@gmail.com';
const DUBIZZLE_PASSWORD = 'Sharshaheen@2050';

const GOOGLE_SHEET_ID = '1MKhbnnVJ7s-kLqT750JJvscOj8a-1iFKUbD4PiTKZrc';

const WAIT_OPTIONS = { timeout: 60 * 1000 }; // 5 минут

/**
 * 
 * @param {Page} page 
 */
async function login(page) {
    console.log('[Авторизация] Начата')

    // await page.setDefaultNavigationTimeout(120000);

    const customUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';
 
    // Set custom user agent
    await page.setUserAgent(customUA);

    await page.goto('https://dubai.dubizzle.com/user/auth?next=/en/?verify_flow=1' , { waitUntil: 'domcontentloaded' });

    console.log('[Авторизация] Перешли на страницу авторизации')

    await page.waitForSelector('#popup_login_link', WAIT_OPTIONS);

    console.log('[Авторизация] Страница авторизации загрузилась')

    await page.click('#popup_login_link');

    console.log('[Авторизация] Нажали на кнопку авторизации через Email')

    await page.waitForSelector('#popup_email', WAIT_OPTIONS);

    console.log('[Авторизация] Форма авторизации через Email открылась')

    await page.focus('#popup_email');
    await page.keyboard.type(DUBIZZLE_LOGIN);

    console.log('[Авторизация] Ввели логин')

    await page.focus('#popup_password');
    await page.keyboard.type(DUBIZZLE_PASSWORD);

    console.log('[Авторизация] Ввели пароль')

    await page.click('#popup_login_btn');

    console.log('[Авторизация] Нажали на кнопку submit')

    await page.waitForSelector('.homepage', WAIT_OPTIONS);

    console.log('[Авторизация] Редирект на главную прошел успешно')
    console.log('[Авторизация] Завершена')
}

/**
 * 
 * @param {Page} page 
 */
async function injectInfectedFunctions(page) {
    const dataId = 'data-chart';

    await page.evaluate((dataId) => {
        getDateParameters = (e) => {
            startDateEpoch = getUnixTimeStamp(addDays(new Date(), -30)), endDateEpoch = getUnixTimeStamp(addDays(new Date()));
            var t = "/?start=" + startDateEpoch + "&end=" + endDateEpoch;
            return t
        };

        getStatsData = (e, t, a, o, i) => {
            var r = getDateParameters(i),
                n = a.map(function(a) {
                    var i = "/api/v2/listing_stats/" + e + "/" + t + "/" + a.type + "/" + o + r;
                    return fetchStatsData(i)
                });
            return Promise.all(n).then(data => {    
                const statsData = getStatsSeries(data, a);
                const statsCategories = getStatsCategories(statsData, o, i);

                const json = JSON.stringify({ statsData, statsCategories });

                const element = document.createElement('div');
                
                element.setAttribute('id', dataId);

                element.innerText = json;
        
                const body = document.querySelector('body');
        
                body.appendChild(element);
        
                return data;
            })
        };
    }, dataId);

    return async () => {
        const selector = `#${dataId}`;

        await page.waitForSelector(selector, WAIT_OPTIONS);

        return async () => {
            const statsData = await page.evaluate((selector) => {
                const json = document.querySelector(selector);

                const data = JSON.parse(json.innerText);

                return data;
            }, selector);

            const removeStatsData = async () => {
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);

                    element.remove();
                }, selector);
            }

            return [statsData, removeStatsData];
        }
    };
}

/**
 * 
 * @param {Page} page 
 */
async function parseStats(page) {
    const result = [];
    const pricesFeatures = {};

    await page.goto('https://dubai.dubizzle.com/mylistings/?status=live', { waitUntil: 'load', timeout: 3 * 60 * 1000 });

    console.log('[Parsing] Совершен переход в личный кабинет в раздел Live')

    await page.waitForSelector('.listing.is-live .stats-menu-option', WAIT_OPTIONS);
    await page.waitForSelector('.listing__wrapper', WAIT_OPTIONS);

    const waitStatsData = await injectInfectedFunctions(page);

    console.log('[Parsing] Инжект зараженных функций прошел успешно')

    const itemsCount = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.listing.is-live')).length;
    });

    console.log('[Parsing] Начат сбор статиcтики')
    console.log(`[Parsing] Количество айтемов: ${itemsCount}`)

    for (let i = 0; i < itemsCount; i++) {
        const hasStats = await page.evaluate((i) => {
            const element = document.querySelector('.listing.is-live');

            const statsMenuOptions = element?.querySelector('.stats-menu-option');

            if (statsMenuOptions) {
                statsMenuOptions.click();

                return true;
            }

            return false;
        }, i);

        if (hasStats) {
            const parseStatsData = await waitStatsData();

            const [stats, removeStatsData] = await parseStatsData();
    
            const [title, url, id, price, feature] = await page.evaluate(() => {
                const element = document.querySelector('.listing.is-live');
                const title = element.querySelector('.listing__title');

                const url = title.getAttribute('href');
                const price = Number(element.querySelector('.listing__price').innerText.replace(/\D/ig, ''));
                const featured = element.querySelector('.listing__tag.featured');
                const premium = element.querySelector('.listing__tag.super_ad');

                let feature = null;

                if (featured) {
                    feature = featured.innerText;
                } else if (premium) {
                    feature = premium.innerText;
                }

                return [
                    title?.getAttribute('title'),
                    url,
                    url?.split('---')[1].replace('/', ''),
                    price,
                    feature,
                ]
            });

            if (stats.statsData.every((data) => data.data.length > 0)) {
                result.push({
                    title,
                    id,
                    url,
                    stats: stats.statsData.map((data) => ({
                        type: data.name,
                        data: data.data.map((data) => ({
                            date: data.name,
                            value: data.y
                        })),
                    })),
                });
                
                pricesFeatures[id] = {
                    price,
                    feature,
                }

                console.log(`[Parsing] ID объявления ${id}`)
            }
    
            await removeStatsData();
    
            await page.click('.close-stats');
        }

        await page.evaluate(() => {
            const element = document.querySelector('.listing.is-live');

            element?.remove();
        });
    }

    console.log('[Parsing] Статистика успешно собрана')

    return [result, pricesFeatures];
}

async function saveMonthToGoogleSheets(processedStats, pricesFeatures) {
    const excel = processedStats.sort((dataA, dataB) => dataB.dateTime - dataA.dateTime)
    .reduce((acc, curr) => {
        for (let i = 0; i < curr.data.length; i++) {
            const item = curr.data[i];

            acc.push(item);
        }
        
        return acc;
    }, [])
    .map((row) => {
        const currentDateFeatureItem = pricesFeatures.find((item) => item.dateTime === row.dateTime);

        const priceFeatureItem = currentDateFeatureItem ? currentDateFeatureItem.pricesFeatures[row.id] : undefined;

        const price = priceFeatureItem ? (priceFeatureItem.price || 'None') : 'No data'
        const feature = priceFeatureItem ? (priceFeatureItem.feature || 'None') : 'No data';

        return [
            row.dateString,
            row.id,
            row.url,
            row.title,
            price,
            feature,
            row.emailLeads,
            row.phoneLeads,
            row.smsLeads,
            row.chatLeads,
            row.detailViews,
            row.searchViews,
            row.refreshes
        ]
    });

    // @ts-ignore
    const credentials = JSON.parse(fs.readFileSync('./google-spreadsheet-credentials.json'));

    const jwt = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, jwt);

    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['Скользящая статистика за полгода'];

    await sheet.clear();

    /**
     * Рендерим шапку
     */
    const header = ['Дата', 'ID', 'URL', 'Название', 'Цена', 'Услуга', 'Email leads', 'Phone leads', 'SMS leads', 'Chat leads', 'Detail Views', 'Search Views', 'Refreshes', '', 'Последнее обновление', new Date().toLocaleDateString('ru-RU', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        minute: 'numeric',
        hour: 'numeric',
        timeZone: "Asia/Dubai"
    }), 'по Дубайскому времени'];

    await sheet.loadCells({ startRowIndex: 0, startColumnIndex: 0 });

    header.forEach((title, idx) => {
        const cell = sheet.getCell(0, idx);

        cell.value = title;
    });


    await sheet.saveUpdatedCells()

    /**
     * Добавляем данные
     */
    await sheet.addRows(excel);
}

async function saveToGoogleSheets(processedStats) {
    console.log('[GoogleSheets] Сохранение')
    const excel = processedStats.sort((dataA, dataB) => dataB.dateTime - dataA.dateTime).reduce((acc, curr) => {
        for (let i = 0; i < curr.data.length; i++) {
            const item = curr.data[i];

            acc.push(item);
        }
        
        return acc;
    }, [])
    .map((row) => {
        return [
            row.dateString,
            row.id,
            row.url,
            row.title,
            row.emailLeads,
            row.phoneLeads,
            row.smsLeads,
            row.chatLeads,
            row.detailViews,
            row.searchViews,
            row.refreshes
        ]
    });

    // @ts-ignore
    const credentials = JSON.parse(fs.readFileSync('./google-spreadsheet-credentials.json'));

    const jwt = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, jwt);

    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['Скользящая статистика за месяц'];

    await sheet.clear();

    /**
     * Рендерим шапку
     */
    const header = ['Дата', 'ID', 'URL', 'Название', 'Email leads', 'Phone leads', 'SMS leads', 'Chat leads', 'Detail Views', 'Search Views', 'Refreshes', '', 'Последнее обновление', new Date().toLocaleDateString('ru-RU', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        minute: 'numeric',
        hour: 'numeric',
        timeZone: "Asia/Dubai"
    }), 'по Дубайскому времени'];

    await sheet.loadCells({ startRowIndex: 0, startColumnIndex: 0 });

    header.forEach((title, idx) => {
        const cell = sheet.getCell(0, idx);

        cell.value = title;
    });

    await sheet.saveUpdatedCells()

    /**
     * Добавляем данные
     */
    await sheet.addRows(excel);

    console.log('[GoogleSheets] Сохранение прошло успешно')
}

// @ts-ignore
async function saveToFirestore(stats = JSON.parse(fs.readFileSync('./storage.json'))) {
    console.log(`[Firestore] Сохранение`)
    const dates = stats[0].stats[0].data.map((data) => startOfDay(data.date)).sort((a, b) => {
        return b - a;
    }).slice(0, 30);

    const processedStats = dates.reduce((acc, dateTime) => {
        const storage = []

        for (let i = 0; i < stats.length; i++) {
            const item = stats[i];

            const title = item.title;
            const id = item.id;
            const url = item.url;
            const emailLeads = item.stats.find((stat) => stat.type === 'Email leads').data.find((data) => startOfDay(data.date) === dateTime).value;
            const phoneLeads = item.stats.find((stat) => stat.type === 'Phone leads').data.find((data) => startOfDay(data.date) === dateTime).value;
            const smsLeads = item.stats.find((stat) => stat.type === 'SMS leads').data.find((data) => startOfDay(data.date) === dateTime).value;
            const chatLeads = item.stats.find((stat) => stat.type === 'Chat leads').data.find((data) => startOfDay(data.date) === dateTime).value;
            const detailViews = item.stats.find((stat) => stat.type === 'Detail Views').data.find((data) => startOfDay(data.date) === dateTime).value;
            const searchViews = item.stats.find((stat) => stat.type === 'Search Views').data.find((data) => startOfDay(data.date) === dateTime).value;
            const refreshes = item.stats.find((stat) => stat.type === 'Refreshes').data.find((data) => startOfDay(data.date) === dateTime).value;

            storage.push({
                dateTime,
                dateString: new Date(dateTime).toLocaleDateString('ru-RU', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: "Asia/Dubai",
                }),
                title,
                id,
                url,
                emailLeads,
                phoneLeads,
                smsLeads,
                chatLeads,
                detailViews,
                searchViews,
                refreshes
            });
        }

        acc.push({
            dateTime,
            data: storage,
        })

        return acc;
    }, []);
    
    const db = firestore.getFirestore();

    const snapshot = await db.collection('dubizzle-lk-stats').where('dateTime', 'in', dates).get()

    const firestoreStats = snapshot.docs.map((doc) => {
        return doc.data();
    });

    const mergedStats = dates.reduce((acc, dateTime) => {
        const firestoreStat = firestoreStats.find((data) => data.dateTime === dateTime);
        const processedStat = processedStats.find((data) => data.dateTime === dateTime);

        if (firestoreStat && processedStat) {
            const data = processedStat.data;

            for (let i = 0; i < firestoreStat.data.length; i++) {
                const firestoreStatItem = firestoreStat.data[i];

                const element = data.find((item) => item.id === firestoreStatItem.id)

                if (!element) {
                    data.push(firestoreStatItem);
                }
            }

            acc.push({
                dateTime,
                data,
            });
        } else {
            acc.push(processedStat);
        }

        return acc;
    }, [])

    for (let i = 0; i < mergedStats.length; i++) {
        const item = mergedStats[i];

        const docRef = db.collection('dubizzle-lk-stats').doc(`${item.dateTime}`);

        await docRef.set(item);
    }

    console.log(`[Firestore] Сохранение прошло успешно`)

    return mergedStats;
}

async function savePricesToFirestore(pricesFeatures) {
    const dateTime = startOfDay(new Date());

    const db = firestore.getFirestore();

    const docRef = db.collection('dubizzle-lk-stats-prices-features').doc(`${dateTime}`);

    await docRef.set({
        pricesFeatures,
        dateTime,
    });
}

async function main() {
    console.log('[Browser] Попытка запуска браузера');

    const browser = await puppeteer.launch({
        defaultViewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
        headless: 'new',
        // headless: false,
        args: [
            `--window-size=${BROWSER_WIDTH},${BROWSER_HEIGHT}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        timeout: 60_000,
    });

    console.log('[Browser] Браузер запущен');

    const page = await browser.newPage(); 

    console.log('[Browser] Стратовая страница открыта');

    await login(page);

    const [stats, pricesFeatures] = await parseStats(page);

    await browser.close();

    console.log('[Browser] Браузер закрыт')

    await firebaseInit();

    await savePricesToFirestore(pricesFeatures);
    await saveToFirestore(stats);

    const last180Days = getLast180Days();

    const datesArray = last180Days.map((date) => startOfDay(date));

    if (true) {
        const chunks = getChunksFromArray(datesArray, 30);

        const db = firestore.getFirestore();

        let stats = [];
        let featurePrices = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]

            const statsSnapshot = await db.collection('dubizzle-lk-stats').where('dateTime', 'in', chunk).get();

            const statsSnapshotfirestoreStats = statsSnapshot.docs.map((doc) => {
                return doc.data();
            });

            const featurePricesSnapshot = await db.collection('dubizzle-lk-stats-prices-features').where('dateTime', 'in', chunk).get();

            const featurePricesSnapshotfirestoreStats = featurePricesSnapshot.docs.map((doc) => {
                return doc.data();
            });

            stats = [...stats, ...statsSnapshotfirestoreStats];
            featurePrices = [...featurePrices, ...featurePricesSnapshotfirestoreStats]
        }

        console.log('featurePrices', featurePrices)

        await saveMonthToGoogleSheets(stats, featurePrices);

        console.log('Месячный отчет успешно сформирован');
    }

    console.log('Скрипт успешно отработал');
}


async function start() {
    console.log('Старт')

    Sentry.init({
        dsn: "https://e1c6abd4b03dab095de2628a5c8b9112@o4506582960504832.ingest.sentry.io/4506582962274304",
        integrations: [
            new ProfilingIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: 1.0, //  Capture 100% of the transactions
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: 1.0,
    });

    console.log('Sentry инициализирован')

    await tryNTimes(main, 10, 60 * 1000);
}

/**
 * Запускаем каждый день в 01:00, 12:00, 19:00
 */
start();


/**
 * Utils
 */

async function firebaseInit() {
    // @ts-ignore
    const credential = JSON.parse(fs.readFileSync('google-firestore-credentials.json'))

    firebase.initializeApp({
        credential: firebase.cert(credential)
    });
}

function startOfDay(date) {
    const start = new Date(date);
    
    start.setUTCHours(0,0,0,0);

    return start.getTime();
}

async function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

async function tryNTimes(toTry, times = 5, interval = 1000) {
    if (times < 1) throw new Error(`Bad argument: 'times' must be greater than 0, but ${times} was received.`);

    let attemptCount = 0
    
    while (true) {
        try {
            console.log('Try - ' + (attemptCount + 1));
            const result = await toTry();

            return;
        } catch(error) {
            console.error(error);
            if (++attemptCount >= times) {
                Sentry.captureException(error);
                throw error
            };
        }
        await delay(interval);
    }
}

function isLastDayOfMonth(date) {
    const d = new Date(date);
    const nextDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    
    return nextDay.getMonth() !== d.getMonth();
}

function getDaysCountInCurrentMonth() {
    const year = (new Date()).getFullYear();

    
}

function getChunksFromArray(array, size) {
    const chunks = [];

    for (let i = 0; i < array.length; i += size) {
        const chunk = array.slice(i, i + size);
        // do whatever
        chunks.push(chunk);
    }

    return chunks;
}

function getLast180Days() {
    const datesArray = [];
    const today = new Date();

    for (let i = 0; i < 180; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    datesArray.push(date);
    }

    datesArray.sort((a, b) => b - a);

    return datesArray;
}
