import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';
import * as firebase from 'firebase-admin/app';
import * as firestore from 'firebase-admin/firestore';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

const BROWSER_WIDTH = 1920;
const BROWSER_HEIGHT = 1080;

const DUBIZZLE_LOGIN = 'adssharmaxmotors@gmail.com';
const DUBIZZLE_PASSWORD = 'Saatjian286';

const GOOGLE_SHEET_ID = '1MKhbnnVJ7s-kLqT750JJvscOj8a-1iFKUbD4PiTKZrc';

const WAIT_OPTIONS = { timeout: 5 * 60 * 1000 }; // 5 минут

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
    console.log('[Parsing] Начат сбор статиcтики')
    const result = [];

    await page.goto('https://dubai.dubizzle.com/mylistings/?status=live', { waitUntil: 'domcontentloaded' });

    console.log('[Parsing] Совершен переход в личный кабинет в раздел live')

    await page.waitForSelector('.listing.is-live .stats-menu-option', WAIT_OPTIONS);

    const waitStatsData = await injectInfectedFunctions(page);

    console.log('[Parsing] Инжект зараженных функций прошел успешно')

    const itemsCount = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.listing.is-live')).length;
    });

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
    
            const [title, id] = await page.evaluate(() => {
                const element = document.querySelector('.listing.is-live .listing__title');
    
                return [
                    element?.getAttribute('title'),
                    element?.getAttribute('href')?.split('---')[1].replace('/', ''),
                ]
            });

            if (stats.statsData.every((data) => data.data.length > 0)) {
                result.push({
                    title,
                    id,
                    stats: stats.statsData.map((data) => ({
                        type: data.name,
                        data: data.data.map((data) => ({
                            date: data.name,
                            value: data.y
                        })),
                    })),
                });
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

    return result;
}

async function saveMonthToGoogleSheets(processedStats) {
    const currDate = new Date(processedStats[0].dateTime);
    const currMonth = currDate.getMonth();
    const date = currDate.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
    });

    const excel = processedStats.sort((dataA, dataB) => dataB.dateTime - dataA.dateTime)
    .filter((date) => {
        const dateObj = new Date(date.dateTime);
        const month = dateObj.getMonth();

        return month === currMonth;
    })
    .reduce((acc, curr) => {
        for (let i = 0; i < curr.data.length; i++) {
            const item = curr.data[i];

            acc.push(item);
        }
        
        return acc;
    }, [])
    .map((row) => {
        return [
            row.dateString,
            row.title,
            row.id,
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

    let sheet = doc.sheetsByTitle[date];

    if (sheet) {
        return;
    }

    sheet = await doc.addSheet({
        title: date,
        index: 1,
    });

    /**
     * Рендерим шапку
     */
    const header = ['Дата', 'Название', 'ID', 'Email leads', 'Phone leads', 'SMS leads', 'Chat leads', 'Detail Views', 'Search Views', 'Refreshes', '', 'Последнее обновление', new Date().toLocaleDateString('ru-RU', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        minute: 'numeric',
        hour: 'numeric',
        timeZone: "Asia/Dubai",
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
            row.title,
            row.id,
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
    const header = ['Дата', 'Название', 'ID', 'Email leads', 'Phone leads', 'SMS leads', 'Chat leads', 'Detail Views', 'Search Views', 'Refreshes', '', 'Последнее обновление', new Date().toLocaleDateString('ru-RU', {
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

// @ts-ignore
async function saveToFirestore(stats = JSON.parse(fs.readFileSync('./storage.json'))) {
    const dates = stats[0].stats[0].data.map((data) => startOfDay(data.date)).sort((a, b) => {
        return b - a;
    }).slice(0, 30);

    const processedStats = dates.reduce((acc, dateTime) => {
        const storage = []

        for (let i = 0; i < stats.length; i++) {
            const item = stats[i];

            const title = item.title;
            const id = item.id;
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

    // fs.writeFileSync('./processedStats.json', JSON.stringify(processedStats))

    // const processedStats = JSON.parse(fs.readFileSync('./processedStats.json'));

    // const dates = processedStats.map(s => s.dateTime).sort((a, b) => {
    //     return b - a;
    // }).slice(0, 30);

    await firebaseInit();
    
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

                if (!data.find((item) => item.id === firestoreStatItem.id)) {
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

    // fs.writeFileSync('./firestoreStats.json', JSON.stringify(firestoreStats));
    // fs.writeFileSync('./mergedStats.json', JSON.stringify(mergedStats));

    for (let i = 0; i < mergedStats.length; i++) {
        const item = mergedStats[i];

        const docRef = db.collection('dubizzle-lk-stats').doc(`${item.dateTime}`);

        await docRef.set(item);
    }

    return mergedStats;
}

async function main() {
    console.log('Попытка запуска браузера');

    const browser = await puppeteer.launch({
        defaultViewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
        headless: 'new',
        args: [`--window-size=${BROWSER_WIDTH},${BROWSER_HEIGHT}`, '--no-sandbox', '--disable-setuid-sandbox'],
    });

    console.log('Браузер запущен');

    const page = await browser.newPage(); 

    console.log('Стратовая страница открыта');

    await login(page);

    const stats = await parseStats(page);

    browser.close();

    console.log('Браузер закрыт')

    const processedMergedStats = await saveToFirestore(stats);

    console.log('Соранение в Firestore прошло успешно')

    await saveToGoogleSheets(processedMergedStats);

    console.log('Соранение в Google Sheets прошло успешно')

    if (isLastDayOfMonth(processedMergedStats[0].dateTime)) {
        await saveMonthToGoogleSheets(processedMergedStats);

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

    await tryNTimes(main, 10, 5 * 60 * 1000);
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
    const credential = JSON.parse(fs.readFileSync('./google-firestore-credentials.json'))

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
