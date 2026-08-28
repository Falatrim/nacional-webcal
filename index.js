const express = require('express');
const axios = require('axios');
const ical = require('ical-generator').default;

const app = express();
const PORT = process.env.PORT || 3000;

// API pública oficial de deportes (Fixture completo y actualizado)
const ESPN_SCHEDULE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uru.1/teams/nacional/schedule';

app.get('/nacional.ics', async (req, res) => {
  try {
    const calendar = ical({ name: 'Alertas Parque Central' });

    const response = await axios.get(ESPN_SCHEDULE_URL);
    const events = response.data.events || [];

    events.forEach(event => {
      const competition = event.competitions[0];
      const venue = competition.venue ? competition.venue.fullName : '';
      const startDate = new Date(event.date);
      const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));

      const esEnParque = venue.toLowerCase().includes('parque central') || 
                         venue.toLowerCase().includes('gran parque central') ||
                         competition.competitors.some(c => c.homeAway === 'home' && c.team.displayName.includes('Nacional'));

      if (esEnParque) {
        calendar.createEvent({
          start: startDate,
          end: endDate,
          summary: `⚠️ PARTIDO: ${event.name}`,
          location: venue || 'Gran Parque Central',
          description: 'Alerta de tránsito: Partido fijado en el Gran Parque Central. Evitar la zona.'
        });
      }
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="nacional.ics"');
    res.send(calendar.toString());

  } catch (error) {
    res.status(500).send('Error generando el calendario');
  }
});

app.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));
