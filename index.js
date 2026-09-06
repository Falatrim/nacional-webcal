const axios = require('axios');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';
const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Error: Faltan variables TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram con éxito.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

function obtenerFechaTexto() {
  const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
  const dia = String(hoyUruguay.getDate()).padStart(2, '0');
  const mes = String(hoyUruguay.getMonth() + 1).padStart(2, '0');
  return `Hoy (${dia}/${mes})`;
}

// 1. PLAN A: Sitio Oficial de Nacional
async function consultarNacionalOficial() {
  console.log('Consultando sitio oficial de Nacional (Plan A)...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.emulateTimezone('America/Montevideo');
    await page.goto(NACIONAL_CALENDARIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
    const diaNum = String(hoyUruguay.getDate()).padStart(2, '0');
    const mesesOficial = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = mesesOficial[hoyUruguay.getMonth()];

    const partidoDeHoy = await page.evaluate((diaNum, mesNombre) => {
      const textoPagina = document.body.innerText || '';

      const tieneFechaHoy = textoPagina.toLowerCase().includes(`${diaNum} ${mesNombre.toLowerCase()}`) || 
                             textoPagina.includes(`${diaNum}/`);
                             
      const esEnElParque = textoPagina.toUpperCase().includes('GRAN PARQUE CENTRAL');

      if (tieneFechaHoy && esEnElParque) {
        const matchHora = textoPagina.match(/\d{1,2}[\s\n]*:[\s\n]*\d{2}/);
        let horaStr = 'A confirmar';
        if (matchHora) {
          horaStr = matchHora[0].replace(/[\r\n\s]+/g, '');
        }

        let torneoStr = 'A confirmar / Desconocido';
        const lineas = textoPagina.split('\n').map(l => l.trim()).filter(Boolean);
        const lineaTorneo = lineas.find(l => 
          /liga|copa|torneo|campeonato/i.test(l) && !l.toLowerCase().includes('todos los')
        );

        if (lineaTorneo) {
          torneoStr = lineaTorneo;
        }

        return { esLocal: true, hora: horaStr, torneo: torneoStr };
      }

      return null;
    }, diaNum, mesNombre);

    if (partidoDeHoy && partidoDeHoy.esLocal) {
      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDeHoy.hora} hs\n` +
        `🏆 <b>Torneo:</b> ${partidoDeHoy.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> Sitio Oficial (nacional.uy)\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;

  } finally {
    if (browser) await browser.close();
  }
}

// 2. PLAN B: Respaldo ESPN con Puppeteer
async function consultarESPN() {
  console.log('Consultando ESPN (Plan B)...');
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.emulateTimezone('America/Montevideo');
    await page.goto(ESPN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
    const diaNum = hoyUruguay.getDate();

    const partidoDetectado = await page.evaluate((diaNum) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      
      for (const fila of filas) {
        const textoOriginal = fila.innerText || '';
        const txt = textoOriginal.replace(/\s+/g, ' ').trim();

        const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(txt);
        const esLocal = /Nacional\s+v\s+/i.test(txt);

        if (coincideDia && esLocal) {
          const matchHora = txt.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
          const horaStr = matchHora ? matchHora[1].toUpperCase() : 'A confirmar';

          let torneoStr = 'A confirmar / Desconocido';
          const celdas = Array.from(fila.querySelectorAll('td'));
          
          if (celdas.length > 0) {
            const textosCeldas = celdas.map(c => c.innerText.trim()).filter(Boolean);
            if (textosCeldas.length > 0) {
              torneoStr = textosCeldas[textosCeldas.length - 1];
            }
          }

          return { hora: horaStr, torneo: torneoStr };
        }
      }
      return null;
    }, diaNum);

    if (partidoDetectado) {
      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora}\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;

  } finally {
    if (browser) await browser.close();
  }
}

async function ejecutar() {
  let errorOficial = null;
  let errorESPN = null;

  try {
    if (await consultarNacionalOficial()) return;
  } catch (err) {
    errorOficial = err.message;
  }

  try {
    if (await consultarESPN()) return;
  } catch (err) {
    errorESPN = err.message;
  }

  if (errorOficial && errorESPN) {
    await enviarMensajeTelegram(
      `⚠️ <b>ALERTA TÉCNICA - BOT NACIONAL</b>\n\n` +
      `No se pudo consultar la información en ninguna fuente:\n` +
      `• Web Oficial: ${errorOficial}\n` +
      `• ESPN: ${errorESPN}`
    );
  }
}

ejecutar();
