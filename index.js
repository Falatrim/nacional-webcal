const axios = require('axios');
const cheerio = require('cheerio');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, '0');
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `Hoy (${dia}/${mes})`;
}

async function probarSoloESPN() {
  console.log('--- INICIANDO PRUEBA EXCLUSIVA DE ESPN ---');
  
  try {
    const { data } = await axios.get(ESPN_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    let partidoDetectado = false;

    const hoyObj = new Date();
    const diaNum = hoyObj.getDate();
    const mesesEspn = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mesTexto = mesesEspn[hoyObj.getMonth()];

    console.log(`Buscando fecha objetivo: Día [${diaNum}] y Mes [${mesTexto}]`);

    $('tr').each((i, element) => {
      const textoFilaOriginal = $(element).text();
      const textoFila = textoFilaOriginal.replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase().trim();

      if (!textoFila) return;

      const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(textoFila);
      const coincideMes = new RegExp(`\\b${mesTexto}\\b`).test(textoFila);
      const esLocal = /\bnac\b.*?\bv\b/.test(textoFila);

      if (coincideDia && coincideMes) {
        console.log(`Fila encontrada para hoy (${diaNum} ${mesTexto}): "${textoFila}"`);
        console.log(`¿Es local (NAC vs ...)? ${esLocal ? 'SÍ' : 'NO'}`);

        if (esLocal) {
          const matchHora = textoFila.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/);
          const horaPartido = matchHora ? matchHora[1].toUpperCase().trim() : 'A confirmar';

          const celdas = $(element).find('td');
          let torneoStr = 'A confirmar / Desconocido';
          if (celdas.length >= 4) {
            const txtCelda = $(celdas[celdas.length - 1]).text().trim();
            if (txtCelda) torneoStr = txtCelda;
          }

          const fechaTexto = obtenerFechaTexto();
          const mensaje = 
            `🚨 <b>PRUEBA ESPN: ALERTA DE TRÁFICO Y ZONA</b>\n\n` +
            `📅 <b>Fecha:</b> ${fechaTexto}\n` +
            `⏰ <b>Hora fijada:</b> ${horaPartido}\n` +
            `🏆 <b>Torneo:</b> ${torneoStr}\n` +
            `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
            `📌 <b>Fuente:</b> ESPN (Prueba Ailada)\n\n` +
            `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

          enviarMensajeTelegram(mensaje);
          partidoDetectado = true;
          return false; // Detiene el bucle
        }
      }
    });

    if (!partidoDetectado) {
      console.log('No se detectó ningún partido de Nacional como local para el día de hoy en ESPN.');
    }

  } catch (error) {
    console.error('Error al consultar ESPN:', error.message);
  }
}

probarSoloESPN();
