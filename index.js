const express = require('express');
const axios = require('axios');
const ics = require('ics');

const app = express();
const PORT = process.env.PORT || 3000;

// API gratuita de TheSportsDB para los próximos partidos de Nacional
const API_URL = 'https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=135364';

app.get(['/', '/calendario.ics'], async (req, res) => {
  try {
    const response = await axios.get(API_URL);
    const eventsData = response.data.events || [];

    // Filtrar partidos jugados de local o en el Gran Parque Central
    let gpcEvents = eventsData.filter(event => {
      const isHome = event.idHomeTeam === '135364';
      const isGPC = event.strVenue && event.strVenue.toLowerCase().includes('gran parque central');
      return isHome || isGPC;
    });

    // Si no hay partidos locales en agenda, mostramos el próximo evento disponible de la API para probar la sincronización
    if (gpcEvents.length === 0 && eventsData.length > 0) {
      gpcEvents = eventsData;
    }

    if (gpcEvents.length === 0) {
      const events = [{
        title: 'Sin partidos confirmados de Nacional',
        start: [2026, 8, 30, 15, 30],
        duration: { hours: 2 },
        description: 'No hay partidos confirmados en el calendario por el momento.'
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

      const venue = event.strVenue || 'Estadio Gran Parque Central';

      return {
        title: `${event.strHomeTeam} vs ${event.strAwayTeam}`,
        description: `Partido por ${event.strLeague || 'Primera División'}.`,
        location: `${venue}, Montevideo, Uruguay`,
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
    res.setHeader('Content-Disposition', 'inline; filename="calendario.ics"');
    res.send(value);

  } catch (err) {
    console.error('Error al consultar TheSportsDB:', err.message);
    res.status(500).send('Error al consultar los datos del partido.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
