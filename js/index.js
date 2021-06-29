Promise.all([
  d3.csv("data/debt.csv"),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
]).then(([debtData, world]) => {
  const { land, countries, nodes, links } = processData(debtData, world);

  const colors = d3
    .range(nodes.length)
    .map((i) => d3.interpolateWarm(i / (nodes.length - 1)));
  const color = d3
    .scaleOrdinal()
    .domain(nodes.map((d) => d.id))
    .range(colors);

  const dispatch = d3
    .dispatch("countrychange")
    .on("countrychange", (country) => {
      globe.onHighlightedChange(country);
    });

  const globe = new Globe({
    container: d3.select("#globe-container"),
    data: { land, countries },
    color,
  });

  const sankey = new Sankey({
    container: d3.select("#sankey-container"),
    data: { nodes, links },
    color,
    dispatch,
  });
});
