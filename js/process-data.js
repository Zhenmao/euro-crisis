function processData(debtData, world) {
  // Country code
  const countryCode = {
    250: { id: "250", code: "FRA", name: "France" },
    276: { id: "276", code: "DEU", name: "Germany" },
    300: { id: "300", code: "GRC", name: "Greece" },
    372: { id: "372", code: "IRL", name: "Ireland" },
    380: { id: "380", code: "ITA", name: "Italy" },
    392: { id: "392", code: "JPN", name: "Japan" },
    620: { id: "620", code: "PRT", name: "Portugal" },
    826: { id: "826", code: "GBR", name: "Britain" },
    724: { id: "724", code: "ESP", name: "Spain" },
    840: { id: "840", code: "USA", name: "United States" },
  };

  // Convert topojson to geojson
  const land = topojson.feature(world, world.objects.land);
  const countries = topojson
    .feature(world, world.objects.countries)
    .features.filter((d) => countryCode[d.id]);
  // Modify country names in geojson to match the data
  countries.forEach((d) => {
    const p = d.properties;
    p.name = countryCode[d.id].name;
    p.code = countryCode[d.id].code;
  });

  // Process debt data
  const idByName = new Map(
    Object.values(countryCode).map((d) => [d.name, d.id])
  );
  // Source: lender (original target)
  // Target: borrower (original source)
  // Value: in $ billions
  const links = debtData.map((d) => ({
    source: idByName.get(d.target),
    target: idByName.get(d.source),
    value: +d.value,
  }));

  const outs = d3.rollup(
    links,
    (v) => ({
      outs: v,
      outTotal: d3.fsum(v, (d) => d.value),
    }),
    (d) => d.source
  );

  const ins = d3.rollup(
    links,
    (v) => ({
      ins: v,
      inTotal: d3.fsum(v, (d) => d.value),
    }),
    (d) => d.target
  );

  const nodes = Object.values(countryCode).reduce((nodes, d) => {
    nodes.push(
      Object.assign(
        d,
        outs.get(d.id) || { outs: [], outTotal: 0 },
        ins.get(d.id) || { ins: [], inTotal: 0 }
      )
    );
    return nodes;
  }, []);
  nodes.sort((a, b) => d3.descending(a.outTotal, b.outTotal));

  const orderedNodeIds = nodes.map((d) => d.id);
  nodes.forEach((d) => {
    d.ins = d.ins.sort((a, b) =>
      d3.ascending(
        orderedNodeIds.indexOf(a.source),
        orderedNodeIds.indexOf(b.source)
      )
    );
    d.outs = d.outs.sort((a, b) =>
      d3.ascending(
        orderedNodeIds.indexOf(a.target),
        orderedNodeIds.indexOf(b.target)
      )
    );
  });

  return {
    land,
    countries,
    nodes,
    links,
  };
}
