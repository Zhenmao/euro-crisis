class Sankey {
  constructor({ container, data: { nodes, links }, color, dispatch }) {
    this.container = container;
    this.nodes = nodes;
    this.links = links;
    this.color = color;
    this.dispatch = dispatch;
    this.resize = this.resize.bind(this);
    this.updateItems = this.updateItems.bind(this);
    this.init();
  }

  init() {
    this.animatedIndex;
    this.highlighted;

    this.wrangleData();

    this.margin = {
      top: 16,
      right: 8,
      bottom: 16,
      left: 80,
    };
    this.labelHeight = 20;
    this.outHeight = Math.round(
      400 * (this.outTotalMax / (this.outTotalMax + this.inTotalMax))
    );
    this.inHeight = 400 - this.outHeight;
    this.sankeyHeight = 200;
    this.height =
      this.margin.top +
      this.outHeight +
      this.labelHeight +
      this.sankeyHeight +
      this.labelHeight +
      this.inHeight +
      this.margin.bottom;
    this.particleRadius = 2.5;

    this.animationDuration = 2000;
    this.itemsPerUnitValue = 1;

    this.formatValue = (value) =>
      value ? `${d3.format("$,.0f")(value)} B` : "";

    this.x = d3.scaleBand().paddingInner(0.1).align(0).domain(this.ids);
    this.yOut = d3
      .scaleLinear()
      .domain([0, this.outTotalMax])
      .range([this.margin.top + this.outHeight, this.margin.top]);
    this.yIn = d3
      .scaleLinear()
      .domain([0, this.inTotalMax])
      .range([
        this.height - this.margin.bottom - this.inHeight,
        this.height - this.margin.bottom,
      ]);
    this.y = d3
      .scaleLinear()
      .domain([0, 1])
      .range([
        this.yOut.range()[0] + this.labelHeight,
        this.yIn.range()[0] - this.labelHeight,
      ]);
    this.xProgress = d3
      .scaleLinear()
      .domain([0.35, 0.65])
      .range([0, 1])
      .clamp(true);

    const pathSteps = 6;
    this.pathData = d3
      .cross(this.ids, this.ids)
      .map((d) => new Array(pathSteps).fill(d));
    this.pathGenerator = d3
      .line()
      .x((d, i) =>
        i <= pathSteps / 2 - 1
          ? this.x(d[0]) + this.x.bandwidth() / 2
          : this.x(d[1]) + this.x.bandwidth() / 2
      )
      .y(
        (d, i) =>
          this.y.range()[0] +
          (i * (this.y.range()[1] - this.y.range()[0])) / (pathSteps - 1)
      )
      .curve(d3.curveMonotoneY);

    this.container.classed("sankey", true).style("height", `${this.height}px`);

    this.svg = this.container.append("svg");
    this.svg.append("g").attr("class", "sankey-paths");
    this.svg.append("g").attr("class", "sankey-labels");
    this.svg.append("g").attr("class", "out-bg-bars");
    this.svg.append("g").attr("class", "out-fg-bars");
    this.svg.append("g").attr("class", "out-labels");
    this.svg.append("g").attr("class", "in-bg-bars").style("display", "none");
    this.svg.append("g").attr("class", "in-fg-bars");
    this.svg.append("g").attr("class", "in-labels");

    this.canvas = this.container.append("canvas");
    this.context = this.canvas.node().getContext("2d");

    this.resize();
    window.addEventListener("resize", this.resize);

    this.animatedIndex = 0;
    this.dispatch.call("countrychange", null, this.ids[this.animatedIndex]);
    this.animate();
  }

  wrangleData() {
    this.ids = this.nodes.map((d) => d.id);

    this.outTotalMax = d3.max(this.nodes, (d) => d.outTotal);
    this.inTotalMax = d3.max(this.nodes, (d) => d.inTotal);

    this.nodes.forEach((d) => {
      const insWithZeroValues = this.ids.map((id) => {
        const inFound = d.ins.find((e) => e.source === id);
        if (inFound) {
          return inFound;
        } else {
          return {
            source: id,
            target: d.id,
            value: 0,
          };
        }
      });
      d.ins = insWithZeroValues;
      let total = 0;
      d.ins.forEach((e) => {
        e.stack = [total, (total += e.value)];
      });
    });

    this.nodeById = new Map(this.nodes.map((d) => [d.id, d]));
  }

  animate() {
    const timeJitter = d3.randomUniform(-0.1, 0.1);
    const xJitter = d3.randomUniform(-0.5, 0.5);
    this.sourceItems = d3.shuffle(
      d3.merge(
        this.nodes[this.animatedIndex].outs.map((d) => {
          return d3
            .range(Math.ceil(d.value / this.itemsPerUnitValue))
            .map(() => ({
              source: d.source,
              target: d.target,
              timeJitter: timeJitter(),
              xJitter: xJitter(),
            }));
        })
      )
    );
    this.sankeyItems = [];
    this.targetItems = [];
    this.itemsTotal = this.sourceItems.length;
    this.timer = d3.timer(this.updateItems);
  }

  updateItems(elapsed) {
    for (let i = 0; i < 2; i++) {
      if (this.sourceItems.length) {
        const item = this.sourceItems.pop();
        item.time = elapsed + item.timeJitter;
        this.sankeyItems.push(item);
      }
    }

    this.sankeyItems = this.sankeyItems.filter((d) => {
      const progress = (elapsed - d.time) / this.animationDuration;
      if (progress <= 1) {
        const xSource = this.x(d.source);
        const xTarget = this.x(d.target);
        const xProgress = this.xProgress(progress);
        d.x =
          xSource +
          (xTarget - xSource) * xProgress +
          d.xJitter * (this.x.bandwidth() - this.particleRadius * 2) +
          0.5 * this.x.bandwidth();
        d.y = this.y(progress);
        return true;
      } else {
        this.targetItems.push(d);
        return false;
      }
    });

    this.targetCount = d3.rollup(
      this.targetItems,
      (v) => v.length,
      (d) => d.target,
      (d) => d.source
    );

    this.renderOutFgBars();
    this.renderInFgBars();
    this.renderInLabels();
    this.renderSankeyParticles();

    if (this.targetItems.length === this.itemsTotal) {
      this.timer.stop();
      if (this.animatedIndex < this.nodes.length - 1) {
        this.animatedIndex++;
        this.dispatch.call("countrychange", null, this.ids[this.animatedIndex]);
        this.animate();
      } else {
        this.animatedIndex = undefined;
        this.dispatch.call("countrychange");
        this.canvas.style("display", "none");
        this.svg.select(".in-bg-bars").style("display", null);
        this.renderOutFgBars();
      }
    }
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.container.node().clientWidth;

    this.x.rangeRound([this.margin.left, this.width - this.margin.right]);

    this.canvas
      .attr("width", this.width * this.dpr)
      .attr("height", this.height * this.dpr);

    this.context.scale(this.dpr, this.dpr);
    this.context.globalAlpha = 0.8;

    this.svg.attr("width", this.width).attr("height", this.height);

    this.renderSankeyPaths();
    this.renderSankeyLabels();
    this.renderOutBgBars();
    this.renderOutFgBars();
    this.renderOutLabels();
    this.renderInBgBars();
    this.renderInFgBars();
    this.renderInLabels();
  }

  renderSankeyParticles() {
    this.context.clearRect(
      this.margin.left,
      this.margin.top + this.outHeight + this.labelHeight - this.particleRadius,
      this.width - this.margin.left - this.margin.right,
      this.sankeyHeight + this.particleRadius * 2
    );

    this.sankeyItems.forEach((d) => {
      this.context.beginPath();
      this.context.moveTo(d.x, d.y);
      this.context.arc(d.x, d.y, this.particleRadius, 0, 2 * Math.PI);
      this.context.fillStyle = this.color(d.source);
      this.context.fill();
    });
  }

  renderSankeyPaths() {
    this.svg
      .select(".sankey-paths")
      .selectAll(".sankey-path")
      .data(this.pathData)
      .join((enter) => enter.append("path").attr("class", "sankey-path"))
      .attr("stroke-width", this.x.bandwidth())
      .attr("d", this.pathGenerator);
  }

  renderSankeyLabels() {
    this.svg
      .select(".sankey-labels")
      .selectChildren(".sankey-label-group")
      .data([
        {
          position: "top",
          translateY: this.y.range()[0] - this.labelHeight,
          label: "Bank Lenders",
        },
        {
          position: "bottom",
          translateY: this.y.range()[1],
          label: "Borrowers",
        },
      ])
      .join((enter) =>
        enter
          .append("g")
          .attr("class", "sankey-label-group")
          .attr("transform", (d) => `translate(0,${d.translateY})`)
          .call((g) =>
            g
              .append("text")
              .attr("class", "sankey-label-group__text")
              .attr("x", this.margin.left - 8)
              .attr("y", this.labelHeight / 2)
              .attr("dy", "0.32em")
              .attr("text-anchor", "end")
              .attr("fill", "currentColor")
              .text((d) => d.label)
          )
      )
      .selectChildren(".sankey-label")
      .data(this.x.domain().map((d) => this.nodes.find((e) => e.id === d)))
      .join((enter) =>
        enter
          .append("g")
          .attr("class", "sankey-label")
          .call((g) =>
            g
              .append("rect")
              .attr("class", "sankey-label__rect")
              .attr("height", this.labelHeight)
          )
          .call((g) =>
            g
              .append("line")
              .attr("class", "sankey-label__line sankey-label__line--top")
              .attr("stroke", "currentColor")
          )
          .call((g) =>
            g
              .append("line")
              .attr("class", "sankey-label__line sankey-label__line--bottom")
              .attr("stroke", "currentColor")
              .attr("y1", this.labelHeight)
              .attr("y2", this.labelHeight)
          )
          .call((g) =>
            g
              .append("text")
              .attr("class", "sankey-label__text")
              .attr("y", this.labelHeight / 2)
              .attr("dy", "0.32em")
              .attr("text-anchor", "middle")
              .attr("fill", "currentColor")
              .text((d) => d.code)
          )
      )
      .classed("is-muted", (d, i, ns) => {
        const position = d3.select(ns[i].parentNode).datum().position;
        if (this.highlighted === undefined) {
          return false;
        } else {
          if (position === "top") {
            return this.highlighted !== d.id;
          } else if (position === "bottom") {
            return d.ins.find((e) => e.source === this.highlighted).value === 0;
          }
        }
      })
      .call((g) =>
        g
          .select(".sankey-label__rect")
          .attr("x", (d) => this.x(d.id))
          .attr("width", (d) => this.x.bandwidth())
      )
      .call((g) =>
        g
          .select(".sankey-label__line--top")
          .attr("x1", (d) => this.x(d.id))
          .attr("x2", (d) => this.x(d.id) + this.x.bandwidth())
      )
      .call((g) =>
        g
          .select(".sankey-label__line--bottom")
          .attr("x1", (d) => this.x(d.id))
          .attr("x2", (d) => this.x(d.id) + this.x.bandwidth())
      )
      .call((g) =>
        g
          .select(".sankey-label__text")
          .attr("x", (d) => this.x(d.id) + this.x.bandwidth() / 2)
      );
  }

  renderOutBgBars() {
    this.svg
      .select(".out-bg-bars")
      .selectAll(".out-bg-bar__rect")
      .data(this.nodes, (d) => d.id)
      .join((enter) =>
        enter
          .append("rect")
          .attr("class", "out-bg-bar__rect")
          .attr("y", (d) => this.yOut(d.outTotal))
          .attr("height", (d) => this.yOut(0) - this.yOut(d.outTotal))
      )
      .attr("x", (d) => this.x(d.id))
      .attr("width", this.x.bandwidth());
  }

  renderOutFgBars() {
    const data = new Map();
    this.nodes.forEach((d, i) => {
      if (this.animatedIndex === undefined) {
        if (this.highlighted === undefined) {
          data.set(d.id, {
            value: d.outTotal,
            color: this.color(d.id),
          });
        } else {
          if (this.highlighted === d.id) {
            data.set(d.id, {
              value: d.outTotal,
              color: this.color(d.id),
            });
          } else {
            data.set(d.id, {
              value: 0,
              color: "currentColor",
            });
          }
        }
      } else {
        if (this.animatedIndex > i) {
          data.set(d.id, {
            value: 0,
            color: this.color(d.id),
          });
        } else if (this.animatedIndex === i) {
          data.set(d.id, {
            value: this.sourceItems.length / this.itemsPerUnitValue,
            color: this.color(d.id),
          });
        } else {
          data.set(d.id, {
            value: d.outTotal,
            color: this.color(d.id),
          });
        }
      }
    });

    this.svg
      .select(".out-fg-bars")
      .selectAll(".out-fg-bar__rect")
      .data(this.nodes, (d) => d.id)
      .join((enter) =>
        enter
          .append("rect")
          .attr("class", "out-fg-bar__rect")
          .on("mouseover", (event, d) => {
            this.highlighted = d.id;
            this.dispatch.call("countrychange", null, d.id);
            this.renderSankeyLabels();
            this.renderOutFgBars();
            this.renderOutLabels();
            this.renderInFgBars();
            this.renderInLabels();
          })
          .on("mouseout", (event, d) => {
            this.highlighted = undefined;
            this.dispatch.call("countrychange");
            this.renderSankeyLabels();
            this.renderOutFgBars();
            this.renderOutLabels();
            this.renderInFgBars();
            this.renderInLabels();
          })
      )
      .attr("stroke-width", this.x.step() - this.x.bandwidth())
      .attr("x", (d) => this.x(d.id))
      .attr("width", this.x.bandwidth())
      .attr("y", (d) => this.yOut(data.get(d.id).value))
      .attr("height", (d) => this.yOut(0) - this.yOut(data.get(d.id).value))
      .attr("fill", (d) => data.get(d.id).color);
  }

  renderOutLabels() {
    this.svg
      .select(".out-labels")
      .selectAll(".out-label__text")
      .data(this.nodes, (d) => d.id)
      .join((enter) =>
        enter
          .append("text")
          .attr("class", "out-label__text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.32em")
          .attr("y", (d) => this.yOut(d.outTotal) - 8)
          .text((d) => this.formatValue(d.outTotal))
      )
      .attr("x", (d) => this.x(d.id) + this.x.bandwidth() / 2)
      .attr("fill", (d) =>
        d.id === this.highlighted ? this.color(d.id) : "currentColor"
      );
  }

  renderInBgBars() {
    const data = new Map();
    this.nodes.forEach((d) => {
      if (this.animatedIndex === undefined) {
        data.set(d.id, { value: d.inTotal });
      } else {
        data.set(d.id, { value: 0 });
      }
    });

    this.svg
      .select(".in-bg-bars")
      .selectAll(".in-bg-bar__rect")
      .data(this.nodes, (d) => d.id)
      .join((enter) =>
        enter
          .append("rect")
          .attr("class", "in-bg-bar__rect")
          .attr("y", (d) => this.yIn(0))
      )
      .attr("x", (d) => this.x(d.id))
      .attr("width", this.x.bandwidth())
      .attr("height", (d) => this.yIn(data.get(d.id).value) - this.yIn(0));
  }

  renderInFgBars() {
    const data = new Map();
    this.nodes.forEach((d) => {
      if (this.animatedIndex === undefined) {
        if (this.highlighted === undefined) {
          data.set(
            d.id,
            d.ins.map((e) => ({
              id: e.target,
              stack: e.stack,
              color: this.color(e.source),
            }))
          );
        } else {
          data.set(
            d.id,
            d.ins
              .filter((e) => e.source === this.highlighted)
              .map((e) => ({
                id: e.target,
                stack: [0, e.value],
                color: this.color(e.source),
              }))
          );
        }
      } else {
        let total = 0;
        data.set(
          d.id,
          d.ins.map((e, i) => {
            let stack;
            if (this.animatedIndex > i) {
              stack = e.stack;
              total = stack[1];
            } else if (this.animatedIndex === i) {
              let itemsCount = 0;
              let found = this.targetCount.get(e.target);
              if (found) {
                itemsCount = found.get(e.source);
              }
              stack = [
                total,
                (total += Math.min(
                  e.value,
                  itemsCount / this.itemsPerUnitValue
                )),
              ];
            } else {
              stack = [total, total];
            }
            return {
              id: e.target,
              stack,
              color: this.color(e.source),
            };
          })
        );
      }
    });

    this.svg
      .select(".in-fg-bars")
      .selectAll(".in-fg-bar__rects")
      .data(this.nodes, (d) => d.id)
      .join((enter) => enter.append("g").attr("class", "in-fg-bar__rects"))
      .selectAll(".in-fg-bar__rect")
      .data((d) => data.get(d.id))
      .join((enter) => enter.append("rect").attr("class", "in-fg-bar__rect"))
      .attr("x", (d) => this.x(d.id))
      .attr("width", this.x.bandwidth())
      .attr("y", (d) => this.yIn(d.stack[0]))
      .attr("height", (d) => this.yIn(d.stack[1]) - this.yIn(d.stack[0]))
      .attr("fill", (d) => d.color);
  }

  renderInLabels() {
    const data = new Map();
    this.nodes.forEach((d) => {
      if (this.animatedIndex === undefined) {
        if (this.highlighted === undefined) {
          data.set(d.id, {
            value: d.inTotal,
            color: "currentColor",
          });
        } else {
          data.set(d.id, {
            value: d.ins.find((e) => e.source === this.highlighted).value,
            color: this.color(this.highlighted),
          });
        }
      } else {
        let total = 0;
        d.ins.forEach((e, i) => {
          if (this.animatedIndex > i) {
            total += e.value;
          } else if (this.animatedIndex === i) {
            let itemsCount = 0;
            let found = this.targetCount.get(e.target);
            if (found) {
              itemsCount = found.get(e.source);
            }
            total += Math.min(e.value, itemsCount / this.itemsPerUnitValue);
          }
        });
        data.set(d.id, {
          value: total,
          color: "currentColor",
        });
      }
    });

    this.svg
      .select(".in-labels")
      .selectAll(".in-label__text")
      .data(this.nodes, (d) => d.id)
      .join((enter) =>
        enter
          .append("text")
          .attr("class", "in-label__text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.32em")
      )
      .attr("x", (d) => this.x(d.id) + this.x.bandwidth() / 2)
      .attr("y", (d) => this.yIn(data.get(d.id).value) + 8)
      .attr("fill", (d) => data.get(d.id).color)
      .text((d) => this.formatValue(data.get(d.id).value));
  }
}
