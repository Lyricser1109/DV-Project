"use strict";

(() => {
  const host = document.getElementById("q2-road-users");
  if (!host) return;

  const showError = error => {
    host.replaceChildren();
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = "The road user chart could not load. Check data/q2_road_user_hospitalisations.csv and your internet connection for D3.";
    host.append(message);
    document.getElementById("q2-year").disabled = true;
    document.getElementById("q2-table-wrap").hidden = true;
    console.error("Q2 road users:", error);
  };

  if (typeof d3 === "undefined") {
    showError(new Error("D3 is unavailable."));
    return;
  }

  const groups = [
    { key: "car_occupants", label: "Car occupants", colour: "#4e79a7" },
    { key: "motorcyclists", label: "Motorcyclists", colour: "#2a9d8f" },
    { key: "other", label: "Other", colour: "#9b9ca9" },
    { key: "pedal_cyclists", label: "Pedal cyclists", colour: "#e5a037" },
    { key: "pedestrians", label: "Pedestrians", colour: "#9565a8" }
  ];
  const years = d3.range(2011, 2022);
  const count = d3.format(",d");
  const percent = d3.format(".1%");
  const signedPercent = d3.format("+.1%");
  const yearSelect = d3.select("#q2-year");

  d3.csv("data/q2_road_user_hospitalisations.csv")
    .then(raw => {
      // This small CSV contains annual sums of the supplied Hospitalisations field.
      const columns = ["year", ...groups.map(group => group.key)];
      if (!columns.every(key => raw.columns.includes(key))) {
        throw new Error("Missing Q2 CSV columns.");
      }

      const data = raw.map(row => {
        const result = {};
        columns.forEach(key => {
          const value = row[key].trim();
          result[key] = value === "" ? NaN : Number(value);
        });
        result.total = d3.sum(groups, group => result[group.key]);
        return result;
      }).sort((a, b) => a.year - b.year);

      if (data.length !== 11 ||
          data.some((row, i) => row.year !== years[i] ||
            columns.some(key => !Number.isInteger(row[key]) || row[key] < 0) ||
            row.total <= 0)) {
        throw new Error("Expected one complete, valid row for every year from 2011 to 2021.");
      }

      const byYear = new Map(data.map(row => [row.year, row]));
      const first = data[0];
      const last = data[data.length - 1];
      const chart = d3.select(host);
      chart.selectAll("*").remove();

      // Use text labels alongside colour, and keep the legend order equal to the stack order.
      const legend = d3.select("#q2-legend").selectAll("li")
        .data(groups).join("li");
      legend.append("span").attr("class", "q2-swatch")
        .attr("aria-hidden", "true").style("background-color", group => group.colour);
      legend.append("span").text(group => group.label);

      yearSelect.selectAll("option").data(years).join("option")
        .attr("value", year => year).text(year => year);
      yearSelect.property("disabled", false);

      const width = 960;
      const height = 450;
      const margin = { top: 28, right: 24, bottom: 65, left: 78 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = d3.scaleLinear().domain([2011, 2021]).range([0, plotWidth]);
      const y = d3.scaleLinear().domain([0, d3.max(data, row => row.total)])
        .nice().range([plotHeight, 0]);

      const scroll = chart.append("div").attr("class", "q2-scroll")
        .attr("role", "region").attr("tabindex", 0)
        .attr("aria-label", "Road user chart. Scroll horizontally on narrow screens.");
      const svg = scroll.append("svg").attr("class", "q2-svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "group").attr("aria-labelledby", "road-user-heading");
      svg.append("desc").text("Stacked area chart of annual hospitalisations by road user group, 2011 to 2021. Band thickness shows each group's count. Focus a year or use the year selector to read exact values in the table.");
      const plot = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      plot.append("g").attr("class", "q2-grid")
        .call(d3.axisLeft(y).ticks(5).tickSize(-plotWidth).tickFormat(""));
      const series = d3.stack().keys(groups.map(group => group.key))(data);
      const area = d3.area()
        .x(point => x(point.data.year))
        .y0(point => y(point[0]))
        .y1(point => y(point[1]));
      plot.selectAll(".q2-area").data(series).join("path")
        .attr("class", "q2-area")
        .attr("d", area)
        .attr("fill", layer => groups.find(group => group.key === layer.key).colour)
        .attr("stroke", "white").attr("stroke-width", 0.7)
        .attr("aria-hidden", "true");

      plot.append("g").attr("class", "q2-axis")
        .attr("transform", `translate(0,${plotHeight})`)
        .call(d3.axisBottom(x).tickValues(years).tickFormat(d3.format("d")).tickPadding(10));
      plot.append("g").attr("class", "q2-axis")
        .call(d3.axisLeft(y).ticks(5).tickFormat(count).tickPadding(8));
      plot.append("text").attr("class", "q2-axis-label")
        .attr("x", plotWidth / 2).attr("y", plotHeight + 51)
        .attr("text-anchor", "middle").text("Calendar year");
      plot.append("text").attr("class", "q2-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -plotHeight / 2).attr("y", -59)
        .attr("text-anchor", "middle").text("Hospitalisations");

      const marker = plot.append("g").attr("class", "q2-marker").attr("aria-hidden", "true");
      marker.append("line").attr("y1", 0).attr("y2", plotHeight);
      const markerDot = marker.append("circle").attr("r", 4);
      const tooltip = chart.append("div").attr("id", "q2-tooltip")
        .attr("class", "q2-tooltip").attr("role", "tooltip").property("hidden", true);
      const hideTooltip = () => tooltip.property("hidden", true);

      const details = d3.select("#q2-table-body").selectAll("tr")
        .data(groups).join("tr");
      details.append("th").attr("scope", "row").text(group => group.label);
      details.append("td").attr("class", "q2-count");
      details.append("td").attr("class", "q2-share");
      details.append("td").attr("class", "q2-change");
      d3.select("#q2-table-wrap").property("hidden", false)
        .attr("tabindex", 0).attr("role", "region")
        .attr("aria-label", "Exact road user values. Scroll horizontally on narrow screens.");

      const change = (value, baseline) =>
        baseline === 0 ? "Not available" : signedPercent((value - baseline) / baseline);

      // Shared update function keeps mouse, keyboard and dropdown interactions consistent.
      const selectYear = year => {
        const row = byYear.get(year);
        yearSelect.property("value", year);
        marker.attr("transform", `translate(${x(year)},0)`);
        markerDot.attr("cy", y(row.total));
        d3.select("#q2-selection")
          .text(`${year}: ${count(row.total)} hospitalisations across five road user groups.`);
        d3.select("#q2-table-caption").text(`Road user counts in ${year}; change compared with 2011`);
        details.select(".q2-count").text(group => count(row[group.key]));
        details.select(".q2-share").text(group => percent(row[group.key] / row.total));
        details.select(".q2-change").text(group => change(row[group.key], first[group.key]));
        d3.select("#q2-total").text(count(row.total));
        d3.select("#q2-total-change").text(change(row.total, first.total));
        return row;
      };

      const inspectYear = (event, row) => {
        selectYear(row.year);
        tooltip.text([
          `${row.year} · Total: ${count(row.total)}`,
          ...groups.map(group => `${group.label}: ${count(row[group.key])} (${percent(row[group.key] / row.total)})`)
        ].join("\n")).property("hidden", false);
        const bounds = event.currentTarget.getBoundingClientRect();
        const box = tooltip.node().getBoundingClientRect();
        const centre = bounds.left + bounds.width / 2;
        const left = Math.max(8, Math.min(centre - box.width / 2, window.innerWidth - box.width - 8));
        const preferredTop = Number.isFinite(event.clientY) && event.clientY > 0
          ? event.clientY - box.height - 12 : bounds.top + 12;
        const top = Math.max(8, Math.min(preferredTop, window.innerHeight - box.height - 8));
        tooltip.style("left", `${left}px`).style("top", `${top}px`);
      };

      // Eleven transparent year targets allow both pointer and keyboard inspection.
      const step = x(2012) - x(2011);
      plot.append("g").selectAll("rect").data(data).join("rect")
        .attr("class", "q2-year-target")
        .attr("x", row => Math.max(0, x(row.year) - step / 2))
        .attr("y", 0)
        .attr("width", row => row.year === 2011 || row.year === 2021 ? step / 2 : step)
        .attr("height", plotHeight)
        .attr("tabindex", 0).attr("role", "img")
        .attr("aria-label", row => `${row.year}: ${count(row.total)} total hospitalisations. ` +
          groups.map(group => `${group.label}, ${count(row[group.key])}`).join("; "))
        .attr("aria-describedby", "q2-tooltip")
        .on("mouseenter", inspectYear)
        .on("focus", inspectYear)
        .on("click", inspectYear)
        .on("mouseleave", hideTooltip)
        .on("blur", hideTooltip)
        .on("keydown", event => {
          if (event.key === "Escape") hideTooltip();
        });

      yearSelect.on("change", event => {
        hideTooltip();
        selectYear(Number(event.target.value));
      });
      const handleViewportChange = () => {
        const active = document.activeElement;
        if (active?.classList.contains("q2-year-target") && !tooltip.property("hidden")) {
          inspectYear({ currentTarget: active }, d3.select(active).datum());
        } else {
          hideTooltip();
        }
      };
      window.addEventListener("scroll", handleViewportChange, true);
      window.addEventListener("resize", handleViewportChange);
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") hideTooltip();
      });

      // Derive the finding from the same data used to draw the chart.
      const largest = groups.reduce((best, group) => last[group.key] > last[best.key] ? group : best);
      const fastest = groups.filter(group => first[group.key] > 0).reduce((best, group) =>
        (last[group.key] / first[group.key]) > (last[best.key] / first[best.key]) ? group : best);
      const growth = percent((last[fastest.key] - first[fastest.key]) / first[fastest.key]);
      d3.select("#q2-finding").text(
        `${largest.label} recorded the most hospitalisations in 2021 (${count(last[largest.key])}). ` +
        `${fastest.label} had the largest percentage increase from 2011 to 2021: ` +
        `${count(first[fastest.key])} to ${count(last[fastest.key])} (${growth}).`
      );
      selectYear(2021);
    })
    .catch(showError);
})();

