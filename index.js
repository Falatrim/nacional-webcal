const express = require('express');
const axios = require('axios');
const ical = require('ical-generator').default;

const app = express();
const PORT = process.env.PORT || 3000;

// API pública de deportes
const ESPN_SCHEDULE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uru.1/teams/nacional/schedule';

app.get('/nacional.ics', async (req, res) => {
  try {
    const calendar = ical({ name: 'Alertas Parque Central' });

    const response = await axios.get(ESPN_SCHEDULE_URL);
    const events = response.data.events || [];

    events.forEach(event => {
      const competition = event.competitions[0];
      const venue = competition.venue ? competition.venue.fullName : 'Gran Parque Central';
      const startDate = new Date(event.date);
      const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));

      // Verificamos si Nacional juega como Local
      const esLocal = competition.competitors.some(c => c.homeAway === 'home' && c.team.displayName.toLowerCase().includes('nacional'));

      // Creamos el evento especificando si es Local o Visitante
      calendar.createEvent({
        start: startDate,
        end: endDate,
        summary: esLocal ? `🏠 LOCAL: ${event.name}` : `✈️ VISITANTE: ${event.name}`,
        location: esLocal ? 'Gran Parque Central' : venue,
        description: esLocal 
          ? '⚠️ ATENCIÓN: Partido de LOCAL en el Gran Parque Central. Precaución por tráfico y cortes de calle.' 
          : 'Partido de visitante.'
      });
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="nacional.ics"');
    res.send(calendar.toString());

  } catch (error) {
    res.status(500).send('Error generando el calendario');
  }
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
