"use strict";

(() => {
  const container = d3.select("#q1-chart");

  if (container.empty()) return;

  const years = d3.range(2011, 2022);
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const formatCount = d3.format(",d");

  const toCount = text => (text.trim() === "" ? NaN : Number(text));

  const formatChange = (value, previous) => {
    const change = (value - previous) / previous * 100;
    const rounded = Math.abs(change).toFixed(1);
    if (rounded === "0.0") return "0.0%";
    return `${change < 0 ? "−" : "+"}${rounded}%`;
  };

  // Read the monthly and annual totals exported from KNIME.
  Promise.all([
    d3.csv("data/q1_national_monthly.csv", row => ({
      year: Number(row["Calendar year"]),
      monthNum: Number(row.MonthNum),
      value: toCount(row.Hospitalisations)
    })),
    d3.csv("data/q1_national_annual.csv", row => ({
      year: Number(row["Calendar year"]),
      value: toCount(row.Hospitalisations)
    }))
  ])
    .then(([monthly, annual]) => {
      // Check that every month and year has one valid count.
      const uniqueMonths = new Set(
        monthly.map(row => `${row.year}-${row.monthNum}`)
      );

      if (
        monthly.length !== 132 ||
        uniqueMonths.size !== 132 ||
        monthly.some(row =>
          !years.includes(row.year) ||
          !Number.isInteger(row.monthNum) ||
          row.monthNum < 1 || row.monthNum > 12 ||
          !Number.isInteger(row.value) ||
          row.value < 0
        )
      ) {
        throw new Error("Expected 132 valid monthly national records.");
      }

      if (
        annual.length !== 11 ||
        annual.some(row =>
          !years.includes(row.year) ||
          !Number.isInteger(row.value) ||
          row.value < 0
        )
      ) {
        throw new Error("Expected 11 valid annual national records.");
      }

      // The monthly rows must add up to the annual totals.
      annual.forEach(row => {
        const total = d3.sum(
          monthly.filter(month => month.year === row.year),
          month => month.value
        );

        if (total !== row.value) {
          throw new Error(`Monthly rows do not sum to ${row.year}.`);
        }
      });

      monthly.sort((a, b) => a.year - b.year || a.monthNum - b.monthNum);
      annual.sort((a, b) => a.year - b.year);

      const modes = {
        monthly: {
          unit: 50,
          step: 12,
          noun: "month",
          comparison: "the same month a year earlier",
          items: monthly.map(row => ({
            year: row.year,
            value: row.value,
            label: `${monthNames[row.monthNum - 1]} ${row.year}`
          }))
        },
        annual: {
          unit: 500,
          step: 1,
          noun: "year",
          comparison: "the previous year",
          items: annual.map(row => ({
            year: row.year,
            value: row.value,
            label: String(row.year)
          }))
        }
      };

      const width = 1000;
      const baseline = 440;
      const dashStep = 5;
      const dashLength = 3;
      const arcY = baseline + 34;
      const margin = { left: 64, right: 16 };

      const state = {
        mode: "monthly",
        limit: modes.monthly.items.length - 1,
        selected: null,
        arcs: true,
        timer: null
      };

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      );
      const animationTiming = {
        monthly: { interval: 100, duration: 240 },
        annual: { interval: 550, duration: 400 }
      };

      container.selectAll("*").remove();

      // Controls
      const controls = container.append("div").attr("class", "q1-controls");

      const modeGroup = controls.append("div")
        .attr("class", "q1-mode")
        .attr("role", "group")
        .attr("aria-label", "Chart view");

      const modeButtons = modeGroup.selectAll("button")
        .data([
          { key: "monthly", text: "Monthly" },
          { key: "annual", text: "Annual" }
        ])
        .join("button")
        .attr("type", "button")
        .attr("class", "q1-button")
        .text(option => option.text);

      const playButton = controls.append("button")
        .attr("type", "button")
        .attr("class", "q1-button q1-play")
        .text("Play");

      const arcLabel = controls.append("label").attr("class", "q1-arc-toggle");
      const arcCheckbox = arcLabel.append("input")
        .attr("type", "checkbox")
        .property("checked", true);
      arcLabel.append("span").text("Show year-on-year arcs");

      const sliderBox = container.append("div")
        .attr("class", "year-control q1-slider");

      const sliderLabel = sliderBox.append("label").attr("for", "q1-limit");
      sliderLabel.append("span").text("Show data up to");
      const sliderOutput = sliderLabel.append("output")
        .attr("for", "q1-limit");

      const slider = sliderBox.append("input")
        .attr("id", "q1-limit")
        .attr("type", "range")
        .attr("min", 0)
        .attr("step", 1);

      const endpoints = sliderBox.append("div").attr("class", "year-endpoints");
      const endpointStart = endpoints.append("span");
      const endpointEnd = endpoints.append("span");

      // Chart area. Horizontal scrolling keeps 132 columns readable.
      const scrollArea = container.append("div").attr("class", "q1-scroll");
      const wrap = scrollArea.append("div").attr("class", "q1-wrap");

      const svg = wrap.append("svg")
        .attr("viewBox", `0 0 ${width} 575`)
        .attr("class", "q1-svg")
        .attr("tabindex", 0)
        .attr("role", "group")
        .attr("aria-labelledby", "q1-chart-heading")
        .attr("aria-describedby", "q1-selection");

      svg.append("desc")
        .text(
          "Dash timeline of national hospitalised road injuries, 2011 to 2021. " +
          "Each stack of dashes is one month or one year. Use the left and " +
          "right arrow keys to move between columns and read exact values."
        );

      const plot = svg.append("g");

      const tooltip = wrap.append("div")
        .attr("id", "q1-tooltip")
        .attr("class", "q1-tooltip")
        .attr("role", "tooltip")
        .property("hidden", true);

      const legend = container.append("p").attr("class", "q1-legend");
      const legendUnit = legend.append("span");
      legend.append("span")
        .attr("class", "q1-key")
        .html('<i class="q1-swatch q1-swatch-down"></i>Lower than a year earlier (taller arc = bigger change)');
      legend.append("span")
        .attr("class", "q1-key")
        .html('<i class="q1-swatch q1-swatch-up"></i>Higher than a year earlier');
      legend.append("span")
        .attr("class", "q1-key")
        .html('<i class="q1-swatch q1-swatch-2020"></i>2020');

      const selection = container.append("p")
        .attr("id", "q1-selection")
        .attr("class", "q1-selection")
        .attr("role", "status");

      const defaultMessage =
        "Hover over the chart, or focus it and use the arrow keys, " +
        "to read each value.";

      let columns;
      let arcPaths;
      let marker;
      let xScale;
      let centres;

      const current = () => modes[state.mode];

      const dashCount = (item, mode) =>
        item.value === 0 ? 0 : Math.max(1, Math.round(item.value / mode.unit));

      const stackHeight = count => count * dashStep - (dashStep - dashLength);

      const describe = index => {
        const mode = current();
        const item = mode.items[index];
        const lines = [item.label, `${formatCount(item.value)} hospitalisations`];

        if (index >= mode.step) {
          const earlier = mode.items[index - mode.step];
          lines.push(
            `${formatChange(item.value, earlier.value)} vs ` +
            `${earlier.label} (${formatCount(earlier.value)})`
          );
        }

        const running = d3.sum(
          mode.items.slice(0, index + 1), entry => entry.value
        );

        return { lines, running };
      };

      const hideTooltip = () => tooltip.property("hidden", true);

      const clearSelection = () => {
        state.selected = null;
        hideTooltip();
        marker.interrupt("q1-marker").attr("visibility", "hidden");
        selection.text(defaultMessage);
        refresh();
      };

      const select = (index, animate = false) => {
        const mode = current();

        if (index < 0 || index > state.limit) return;

        state.selected = index;

        const { lines, running } = describe(index);
        const xCentre = centres[index];
        const columnTop = baseline - stackHeight(dashCount(mode.items[index], mode));

        const moveMarker = animate && !reducedMotion.matches &&
          marker.attr("visibility") === "visible";
        marker.interrupt("q1-marker");
        const markerPosition = moveMarker
          ? marker.transition("q1-marker")
            .duration(Math.min(animationTiming[state.mode].interval, 180))
            .ease(d3.easeLinear)
          : marker;
        marker.attr("visibility", "visible");
        markerPosition
          .attr("x1", xCentre)
          .attr("x2", xCentre);

        selection.text(
          `${lines.join(". ")}. Running total from January 2011: ` +
          `${formatCount(running)}.`
        );

        const moveTooltip = animate && !reducedMotion.matches && !tooltip.property("hidden");
        tooltip
          .style("transition", moveTooltip ? "left 140ms linear, top 140ms linear" : "none")
          .text(lines.join("\n"))
          .property("hidden", false);

        const svgBounds = svg.node().getBoundingClientRect();
        const wrapBounds = wrap.node().getBoundingClientRect();
        const scale = svgBounds.width / width;
        const box = tooltip.node().getBoundingClientRect();

        const left = Math.max(
          0,
          Math.min(xCentre * scale - box.width / 2, wrapBounds.width - box.width)
        );
        const top = Math.max(0, columnTop * scale - box.height - 10);

        tooltip.style("left", `${left}px`).style("top", `${top}px`);

        refresh(animate);
      };

      // Update the parts that change when the selection or reveal limit moves.
      function refresh(animate = false, force = false) {
        const mode = current();
        const duration = animate && !reducedMotion.matches
          ? animationTiming[state.mode].duration : 0;

        // Only animate columns whose reveal state changed. Hovering leaves ongoing
        // growth alone, and each new playback column can grow independently.
        const changedColumns = columns.filter(function (item, index) {
          return force || this.getAttribute("data-revealed") !== String(index <= state.limit);
        });
        changedColumns
          .interrupt("q1-reveal")
          .attr("data-revealed", item => String(mode.items.indexOf(item) <= state.limit));
        const columnPositions = duration
          ? changedColumns.transition("q1-reveal").duration(duration).ease(d3.easeCubicOut)
          : changedColumns;

        columnPositions
          .attr("y2", item => mode.items.indexOf(item) <= state.limit
            ? baseline - stackHeight(dashCount(item, mode)) : baseline)
          .attr("stroke-opacity", item => mode.items.indexOf(item) <= state.limit ? 1 : 0);
        columns
          .classed("q1-dash-active", (item, index) => index === state.selected);

        const arcVisible = arc => state.arcs && arc.index <= state.limit;
        const changedArcs = arcPaths.filter(function (arc) {
          return force || this.getAttribute("data-revealed") !== String(arcVisible(arc));
        });
        changedArcs.interrupt("q1-reveal")
          .attr("data-revealed", arc => String(arcVisible(arc)));
        const arcOpacity = duration
          ? changedArcs.transition("q1-reveal").duration(duration).ease(d3.easeCubicInOut)
          : changedArcs;
        arcOpacity
          .attr("opacity", arc => arcVisible(arc) ? 1 : 0)
          .attr("stroke-dashoffset", arc => arcVisible(arc) ? 0 : 1);
        const activeArc = arc => state.selected !== null &&
          (arc.index === state.selected || arc.index - mode.step === state.selected);
        arcPaths
          .classed("q1-arc-active", activeArc)
          .classed("q1-arc-muted", arc => state.selected !== null && !activeArc(arc));
        arcPaths.filter(activeArc).raise();

        sliderOutput.text(mode.items[state.limit].label);
        slider.property("value", state.limit);
        slider.attr("aria-valuetext", mode.items[state.limit].label);
      }

      const stop = () => {
        if (state.timer !== null) {
          window.clearInterval(state.timer);
          state.timer = null;
        }
        playButton.text("Play");
      };

      const build = (animate = false) => {
        const mode = current();
        const items = mode.items;
        const count = items.length;
        const monthly = state.mode === "monthly";

        plot.selectAll("*")
          .interrupt("q1-reveal")
          .interrupt("q1-marker")
          .remove();

        xScale = d3.scaleBand()
          .domain(d3.range(count))
          .range([margin.left, width - margin.right])
          .paddingInner(monthly ? 0.25 : 0.4)
          .paddingOuter(0.1);

        centres = d3.range(count).map(i => xScale(i) + xScale.bandwidth() / 2);

        // Highlight band for 2020.
        const first2020 = items.findIndex(item => item.year === 2020);
        const last2020 = items.length - 1 -
          [...items].reverse().findIndex(item => item.year === 2020);
        const bandLeft = xScale(first2020) - xScale.step() * xScale.paddingInner() / 2;
        const bandRight = xScale(last2020) + xScale.bandwidth() +
          xScale.step() * xScale.paddingInner() / 2;

        plot.append("rect")
          .attr("class", "q1-band")
          .attr("x", bandLeft)
          .attr("y", 14)
          .attr("width", bandRight - bandLeft)
          .attr("height", baseline - 14);

        plot.append("text")
          .attr("class", "q1-band-label")
          .attr("x", (bandLeft + bandRight) / 2)
          .attr("y", 30)
          .attr("text-anchor", "middle")
          .text("2020");

        // Gridlines in people, not dashes.
        const gridStep = monthly ? 1000 : 10000;
        const gridMax = monthly ? 4000 : 40000;

        const grid = plot.append("g").attr("class", "q1-grid");

        d3.range(0, gridMax + 1, gridStep).forEach(value => {
          const y = baseline - (value / mode.unit) * dashStep;

          grid.append("line")
            .attr("x1", margin.left - 6)
            .attr("x2", width - margin.right)
            .attr("y1", y)
            .attr("y2", y);

          grid.append("text")
            .attr("class", "q1-axis-text")
            .attr("x", margin.left - 12)
            .attr("y", y)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .text(formatCount(value));
        });

        plot.append("text")
          .attr("class", "q1-axis-text")
          .attr("x", 4)
          .attr("y", 8)
          .text(monthly ? "Hospitalisations per month" : "Hospitalisations per year");

        // Dash stacks: one stroked line per column, drawn as dashes.
        columns = plot.append("g")
          .selectAll("line")
          .data(items)
          .join("line")
          .attr("class", item => `q1-dash${item.year === 2020 ? " q1-dash-2020" : ""}`)
          .attr("x1", (item, i) => centres[i])
          .attr("x2", (item, i) => centres[i])
          .attr("y1", baseline)
          .attr("y2", baseline)
          .attr("stroke-opacity", 0)
          .attr("data-revealed", "false")
          .attr("stroke-width", xScale.bandwidth())
          .attr("stroke-dasharray", `${dashLength} ${dashStep - dashLength}`)
          .attr("aria-hidden", "true");

        // Year labels.
        const labels = plot.append("g");

        years.forEach(year => {
          const indexes = d3.range(count).filter(i => items[i].year === year);
          const centre = d3.mean(indexes, i => centres[i]);

          labels.append("text")
            .attr("class", "q1-axis-text")
            .attr("x", centre)
            .attr("y", baseline + 20)
            .attr("text-anchor", "middle")
            .text(year);
        });

        plot.append("line")
          .attr("class", "q1-baseline")
          .attr("x1", margin.left)
          .attr("x2", width - margin.right)
          .attr("y1", baseline)
          .attr("y2", baseline);

        // Arcs link each column to the same period one year earlier.
        const arcData = d3.range(mode.step, count).map(index => ({
          index,
          from: centres[index - mode.step],
          to: centres[index],
          change: items[index].value - items[index - mode.step].value,
          lower: items[index].value < items[index - mode.step].value
        }));

        // Arc height shows the size of the change, so bigger swings stand out.
        const maxChange = d3.max(arcData, arc => Math.abs(arc.change));
        const arcHeight = d3.scaleLinear()
          .domain([0, maxChange])
          .range([2, 90]);

        arcPaths = plot.append("g")
          .attr("class", "q1-arcs")
          .attr("aria-hidden", "true")
          .selectAll("path")
          .data(arcData)
          .join("path")
          .attr("class", arc =>
            `q1-arc ${arc.lower ? "q1-arc-down" : "q1-arc-up"}`
          )
          .attr("opacity", 0)
          .attr("data-revealed", "false")
          // Normalised path lengths let every arc draw smoothly from end to end.
          .attr("pathLength", 1)
          .attr("stroke-dasharray", "1 1")
          .attr("stroke-dashoffset", 1)
          .attr("d", arc => {
            // A quadratic curve peaks at half its control-point depth.
            const depth = 2 * arcHeight(Math.abs(arc.change));
            return `M${arc.from},${arcY} Q${(arc.from + arc.to) / 2},` +
              `${arcY + depth} ${arc.to},${arcY}`;
          });

        marker = plot.append("line")
          .attr("class", "q1-marker")
          .attr("y1", 14)
          .attr("y2", baseline)
          .attr("visibility", "hidden");

        // Transparent hit areas capture the mouse for each column.
        plot.append("g")
          .selectAll("rect")
          .data(items)
          .join("rect")
          .attr("class", "q1-hit")
          .attr("x", (item, i) => xScale(i) - xScale.step() * xScale.paddingInner() / 2)
          .attr("y", 14)
          .attr("width", xScale.step())
          .attr("height", arcY - 14)
          .attr("fill", "transparent")
          .attr("aria-hidden", "true")
          .on("mouseenter", (event, item) => select(items.indexOf(item)))
          .on("mousemove", (event, item) => select(items.indexOf(item)))
          .on("click", (event, item) => select(items.indexOf(item)));

        legendUnit.text(
          `1 dash ≈ ${mode.unit} people (rounded per ${mode.noun})`
        );

        slider.attr("max", count - 1);
        endpointStart.text(items[0].label);
        endpointEnd.text(items[count - 1].label);

        modeButtons.attr("aria-pressed", option =>
          String(option.key === state.mode)
        );

        marker.attr("visibility", "hidden");
        refresh(animate);
      };

      const setMode = key => {
        if (key === state.mode) return;

        stop();
        state.mode = key;
        state.limit = current().items.length - 1;
        state.selected = null;
        hideTooltip();
        selection.text(defaultMessage);
        build(true);
      };

      const play = () => {
        const mode = current();
        const last = mode.items.length - 1;

        if (state.timer !== null) {
          stop();
          return;
        }

        if (reducedMotion.matches) {
          state.limit = last;
          select(last);
          return;
        }

        if (state.limit >= last) {
          state.limit = 0;
          columns.interrupt("q1-reveal")
            .attr("data-revealed", "false")
            .attr("y2", baseline)
            .attr("stroke-opacity", 0);
          arcPaths.interrupt("q1-reveal")
            .attr("data-revealed", "false")
            .attr("opacity", 0)
            .attr("stroke-dashoffset", 1);
          marker.interrupt("q1-marker").attr("visibility", "hidden");
          hideTooltip();
        }

        playButton.text("Pause");
        select(state.limit, true);

        state.timer = window.setInterval(() => {
          state.limit += 1;
          select(state.limit, true);

          if (state.limit >= last) stop();
        }, animationTiming[state.mode].interval);
      };

      modeButtons.on("click", (event, option) => setMode(option.key));
      playButton.on("click", play);

      arcCheckbox.on("change", event => {
        state.arcs = event.currentTarget.checked;
        refresh(true);
      });

      slider.on("input", event => {
        stop();
        state.limit = Number(event.currentTarget.value);
        select(state.limit, true);
      });

      svg.on("mouseleave", clearSelection);

      svg.on("keydown", event => {
        const last = state.limit;
        const from = state.selected === null ? -1 : state.selected;
        let target = null;

        if (event.key === "ArrowRight") target = Math.min(last, from + 1);
        else if (event.key === "ArrowLeft") target = Math.max(0, from <= 0 ? 0 : from - 1);
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = last;
        else if (event.key === "Escape") {
          clearSelection();
          return;
        }

        if (target !== null) {
          event.preventDefault();
          select(target);
        }
      });

      window.addEventListener("scroll", hideTooltip, true);
      window.addEventListener("resize", hideTooltip);
      reducedMotion.addEventListener("change", () => {
        if (!reducedMotion.matches) return;
        stop();
        marker.interrupt("q1-marker");
        tooltip.style("transition", "none");
        refresh(false, true);
        if (state.selected !== null) {
          marker.attr("x1", centres[state.selected]).attr("x2", centres[state.selected]);
        }
      });

      selection.text(defaultMessage);
      build();
    })
    .catch(error => {
      container.selectAll("*").remove();

      container.append("p")
        .attr("role", "alert")
        .text(
          "The national trend chart could not load. Check that " +
          "q1_national_monthly.csv and q1_national_annual.csv are saved in data/."
        );

      console.error("Q1 national trend:", error);
    });
})();
