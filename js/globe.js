class Globe {
  constructor({ container, data: { land, countries }, color }) {
    this.container = container;
    this.land = land;
    this.countries = countries;
    this.color = color;
    this.init();
  }

  init() {
    this.margin = {
      top: 20,
      right: 8,
      bottom: 4,
      left: 8,
    };
    this.radius = 80;
    this.width = this.radius * 2 + this.margin.left + this.margin.right;
    this.height = this.radius * 2 + this.margin.top + this.margin.bottom;

    // geometric center of EU, post-Brexit
    // https://geohack.toolforge.org/geohack.php?pagename=Geographical_midpoint_of_Europe&params=49_50_35_N_9_54_07_E_region:DE_type:landmark&title=geometric+center+of+EU%2C+post-Brexit
    this.defaultCentroid = [9.901944, 49.843056];
    this.projection = d3
      .geoOrthographic()
      .rotate([-this.defaultCentroid[0], -this.defaultCentroid[1]])
      .scale(200)
      .translate([
        this.margin.left + this.radius,
        this.margin.top + this.radius,
      ]);
    this.path = d3.geoPath(this.projection);

    this.container.classed("globe", true);
    this.svg = this.container
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);
    this.defs = this.svg.append("defs");
    this.defineClip();
    this.defineTextPath();
    this.renderSphere();
    this.renderLand();
    this.renderTitle();
  }

  defineClip() {
    this.defs
      .selectChildren(".globe__clip")
      .data([0])
      .join((enter) =>
        enter
          .append("clipPath")
          .attr("class", "globe__clip")
          .attr("id", "globe-clip")
      )
      .selectAll("circle")
      .data([0])
      .join("circle")
      .attr("cx", this.margin.left + this.radius)
      .attr("cy", this.margin.top + this.radius)
      .attr("r", this.radius - 0.5);
  }

  defineTextPath() {
    this.textPathRadius = this.radius + 4;
    this.defs
      .selectChildren(".globe__text-path")
      .data([0])
      .join((enter) =>
        enter
          .append("path")
          .attr("class", "globe__text-path")
          .attr("id", "globe-text-path")
      )
      .attr(
        "d",
        `M ${this.margin.left + this.radius - this.textPathRadius} ${
          this.margin.top + this.radius
        } a ${this.textPathRadius} ${this.textPathRadius} 0 1 1 ${
          this.textPathRadius * 2
        } 0`
      );
  }

  renderTitle() {
    this.svg
      .selectChildren(".globe__title")
      .data(
        this.highlighted
          ? [this.highlighted.properties.name]
          : ["Hover over a bank lenders bar"]
      )
      .join((enter) =>
        enter
          .append("text")
          .attr("class", "globe__title")
          .call((text) =>
            text
              .append("textPath")
              .attr("href", "#globe-text-path")
              .attr("text-anchor", "middle")
              .attr("startOffset", "50%")
          )
      )
      .select("textPath")
      .text((d) => d);
  }

  renderSphere() {
    this.svg
      .selectChildren(".globe__sphere")
      .data([0])
      .join((enter) => enter.append("circle").attr("class", "globe__sphere"))
      .attr("cx", this.margin.left + this.radius)
      .attr("cy", this.margin.top + this.radius)
      .attr("r", this.radius);
  }

  renderLand() {
    this.svg
      .selectChildren(".globe__land")
      .data([this.land])
      .join((enter) =>
        enter
          .append("path")
          .attr("class", "globe__land")
          .attr("clip-path", "url(#globe-clip)")
      )
      .attr("d", this.path);
  }

  renderHighlightedCountry() {
    this.svg
      .selectChildren(".globe__highlighted")
      .data(this.highlighted ? [this.highlighted] : [])
      .join((enter) =>
        enter
          .append("path")
          .attr("class", "globe__highlighted")
          .attr("clip-path", "url(#globe-clip)")
      )
      .attr("fill", (d) => this.color(d.id))
      .attr("d", this.path);
  }

  onHighlightedChange(id) {
    this.highlighted = id ? this.countries.find((d) => d.id === id) : null;
    this.renderTitle();
    d3.transition()
      .duration(1000)
      .tween("rotate", () => {
        const p = this.highlighted
          ? d3.geoCentroid(this.highlighted)
          : this.defaultCentroid;
        const r = d3.interpolate(this.projection.rotate(), [-p[0], -p[1]]);
        return (t) => {
          this.projection.rotate(r(t));
          this.renderLand();
          this.renderHighlightedCountry();
        };
      });
  }
}
