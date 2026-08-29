const express = require('express');
const axios = require('axios');
const ics = require('ics');

const app = express();
const PORT = process.env.PORT || 3000;

// API gratuita de TheSportsDB para los próximos partidos de Nacional
const API_URL = 'https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=135364';

app.get('/calendario.ics', async (req, res) => {
  try {
    const response = await axios.get(API_URL);
    const eventsData = response.data.events || [];

    // Filtrar partidos jugados de local o confirmados en el Gran Parque Central
    const gpcEvents = eventsData.filter(event => {
      const isHome = event.idHomeTeam === '135364';
      const isGPC = event.strVenue && event.strVenue.toLowerCase().includes('gran parque central');
      return isHome || isGPC;
    });

    if (gpcEvents.length === 0) {
      const events = [{
        title: 'Sin partidos confirmados en el GPC',
        start: [2026, 8, 1, 12, 0],
        duration: { hours: 1 },
        description: 'No hay partidos de Nacional confirmados en el Gran Parque Central por el momento.'
      }];
      const { value } = ics.createEvents(events);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      return res.send(value);
    }

    // Formatear partidos al estándar ICS
    const formattedEvents = gpcEvents.map(event => {
      const eventDate = new Date(event.strTimestamp || `${event.dateEvent}T${event.strTime}`);
      
      const year = eventDate.getUTCFullYear();
      const month = eventDate.getUTCMonth() + 1;
      const day = eventDate.getUTCDate();
      const hours = eventDate.getUTCHours();
      const minutes = eventDate.getUTCMinutes();

      return {
        title: `Nacional vs ${event.strAwayTeam}`,
        description: `Partido por ${event.strLeague || 'Primera División'} en el Gran Parque Central.`,
        location: 'Estadio Gran Parque Central, Montevideo, Uruguay',
        start: [year, month, day, hours, minutes],
        duration: { hours: 2 }
      };
    });

    const { error, value } = ics.createEvents(formattedEvents);

    if (error) {
      console.error('Error generando ICS:', error);
      return res.status(500).send('Error al generar el calendario.');
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendario-gpc.ics"');
    res.send(value);

  } catch (err) {
    console.error('Error al consultar TheSportsDB:', err.message);
    res.status(500).send('Error al consultar los datos del partido.');
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Gran Parque Central activo.');
});

app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
