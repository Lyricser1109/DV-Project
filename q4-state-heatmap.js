"use strict";

(() => {
  const container = d3.select("#state-heatmap");

  if (container.empty()) return;

  const years = d3.range(2011, 2022);
  const states = ["ACT", "NSW", "NT", "Qld", "SA", "Tas", "Vic", "WA"];
  const formatCount = d3.format(",d");

  // Read the annual totals exported from KNIME.
  d3.csv("data/q4_state_hospitalisations.csv", row => ({
    year: Number(row.year),
    state: row.state.trim(),
    hospitalisations: row.hospitalisations.trim() === ""
      ? NaN
      : Number(row.hospitalisations)
  }))
    .then(data => {
      // Check that every year and jurisdiction has one valid count.
      const uniquePairs = new Set(
        data.map(row => `${row.year}-${row.state}`)
      );

      if (
        data.length !== 88 ||
        uniquePairs.size !== 88 ||
        data.some(row =>
          !years.includes(row.year) ||
          !states.includes(row.state) ||
          !Number.isInteger(row.hospitalisations) ||
          row.hospitalisations < 0
        )
      ) {
        throw new Error("Expected 88 valid annual jurisdiction records.");
      }

      container.selectAll("*").remove();

      const width = 940;
      const height = 520;
      const margin = { top: 45, right: 20, bottom: 125, left: 85 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;

      // Keep labels readable on small screens by allowing horizontal scrolling.
      const scrollArea = container.append("div")
        .attr("class", "state-chart-scroll")
        .attr("tabindex", 0)
        .attr("role", "region")
        .attr("aria-label", "State heatmap. Scroll horizontally on small screens.");

      const svg = scrollArea.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("class", "state-chart-svg")
        .attr("role", "group")
        .attr("aria-labelledby", "state-chart-heading");

      svg.append("desc")
        .text(
          "Annual hospitalisations for eight Australian jurisdictions, " +
          "2011 to 2021. Darker blue represents higher counts. " +
          "Focus a cell to read its exact value."
        );

      const plot = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

      const x = d3.scaleBand()
        .domain(years)
        .range([0, plotWidth])
        .padding(0.04);

      const y = d3.scaleBand()
        .domain(states)
        .range([0, plotHeight])
        .padding(0.06);

      const [minimum, maximum] = d3.extent(
        data, row => row.hospitalisations
      );

      const colour = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, maximum]);

      plot.append("g")
        .attr("class", "state-axis")
        .attr("transform", `translate(0, ${plotHeight})`)
        .call(d3.axisBottom(x).tickSize(0).tickPadding(12))
        .call(axis => axis.select(".domain").remove());

      plot.append("g")
        .attr("class", "state-axis")
        .call(
          d3.axisLeft(y)
            .tickSize(0)
            .tickPadding(12)
            .tickFormat(state =>
              state === "NSW" || state === "Vic" ? `${state}*` : state
            )
        )
        .call(axis => axis.select(".domain").remove());

      // One tooltip supports both mouse and keyboard interaction.
      const tooltip = container.append("div")
        .attr("id", "state-tooltip")
        .attr("class", "state-tooltip")
        .attr("role", "tooltip")
        .property("hidden", true);

      const selection = container.append("p")
        .attr("class", "state-selection")
        .attr("role", "status")
        .text("Select a cell to inspect its annual count.");

      const hideTooltip = () => tooltip.property("hidden", true);

      const showTooltip = (event, row) => {
        const text =
          `${row.state} · ${row.year}: ` +
          `${formatCount(row.hospitalisations)} hospitalisations`;

        selection.text(text);

        tooltip.text(text).property("hidden", false);

        const bounds = event.currentTarget.getBoundingClientRect();
        const tooltipBounds = tooltip.node().getBoundingClientRect();

        const left = Math.max(
          8,
          Math.min(
            bounds.left + bounds.width / 2 - tooltipBounds.width / 2,
            window.innerWidth - tooltipBounds.width - 8
          )
        );

        const top = bounds.top > tooltipBounds.height + 16
          ? bounds.top - tooltipBounds.height - 8
          : bounds.bottom + 8;

        tooltip.style("left", `${left}px`).style("top", `${top}px`);
      };

      plot.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("class", "state-cell")
        .attr("x", row => x(row.year))
        .attr("y", row => y(row.state))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 3)
        .attr("fill", row => colour(row.hospitalisations))
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr("aria-label", row =>
          `${row.state}, ${row.year}, ` +
          `${formatCount(row.hospitalisations)} hospitalisations`
        )
        .attr("aria-describedby", "state-tooltip")
        .on("mouseenter", showTooltip)
        .on("mouseleave", hideTooltip)
        .on("focus", showTooltip)
        .on("blur", hideTooltip)
        .on("click", showTooltip)
        .on("keydown", event => {
          if (event.key === "Escape") hideTooltip();
        });

      // Labels give exact values without relying on colour alone.
      plot.selectAll(".state-value")
        .data(data)
        .join("text")
        .attr("class", "state-value")
        .attr("x", row => x(row.year) + x.bandwidth() / 2)
        .attr("y", row => y(row.state) + y.bandwidth() / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", row =>
          row.hospitalisations > maximum * 0.6 ? "#ffffff" : "#182b3c"
        )
        .attr("aria-hidden", "true")
        .text(row => formatCount(row.hospitalisations));

      // A shared legend applies to every jurisdiction and year.
      const legendX = 115;
      const legendY = plotHeight + 65;
      const legendWidth = 310;
      const steps = 50;

      plot.append("text")
        .attr("class", "state-legend-label")
        .attr("x", legendX)
        .attr("y", legendY - 12)
        .text("Annual hospitalisations");

      plot.append("g")
        .selectAll("rect")
        .data(d3.range(steps))
        .join("rect")
        .attr("x", step => legendX + step * legendWidth / steps)
        .attr("y", legendY)
        .attr("width", legendWidth / steps + 0.5)
        .attr("height", 14)
        .attr("fill", step => colour(step * maximum / (steps - 1)));

      plot.append("text")
        .attr("class", "state-legend-label")
        .attr("x", legendX)
        .attr("y", legendY + 33)
        .text("0");

      plot.append("text")
        .attr("class", "state-legend-label")
        .attr("x", legendX + legendWidth)
        .attr("y", legendY + 33)
        .attr("text-anchor", "end")
        .text(formatCount(maximum));

      plot.append("text")
        .attr("class", "state-legend-label")
        .attr("x", legendX + legendWidth + 30)
        .attr("y", legendY + 12)
        .text(`Observed range: ${formatCount(minimum)}–${formatCount(maximum)}`);

      window.addEventListener("scroll", hideTooltip, true);
      window.addEventListener("resize", hideTooltip);
    })
    .catch(error => {
      container.selectAll("*").remove();

      container.append("p")
        .attr("role", "alert")
        .text(
          "The heatmap could not load. Check that the corrected CSV is " +
          "saved in data/q4_state_hospitalisations.csv."
        );

      console.error("Q4 heatmap:", error);
    });
})();