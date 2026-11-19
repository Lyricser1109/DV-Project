// Horizontal 100% stacked bars, with one bar for each population group.
const loadFirstNationsAgeChart = () => {
    const chart = d3.select("#age-chart");
    const slider = d3.select("#age-year");
    const yearOutput = d3.select("#age-year-value");
    const summary = d3.select("#age-chart-summary");
    const note = d3.select("#age-chart-note");
    const tooltip = d3.select("#age-tooltip");

    const ageGroups = ["0-7", "8-16", "17-25", "26-39", "40-64", "65+"];
    const statuses = ["First Nations people", "Non-Indigenous"];
    const halves = ["Jan-Jun", "Jul-Dec"];
    const colours = d3.scaleOrdinal()
        .domain(ageGroups)
        .range(["#5572c7", "#359f78", "#95c96f", "#f4c44e", "#ef6b6b", "#69bbcf"]);
    const formatCount = d3.format(",d");
    const formatShare = d3.format(".1%");

    d3.csv("data/first-nations-age.csv", d => ({
        year: +d["Calendar year"],
        half: d.Half,
        cause: d.Cause,
        status: d.Status,
        ageGroup: d["Age group"],
        hospitalisations: d.Hospitalisations.trim() === "" ? NaN : +d.Hospitalisations
    })).then(data => {
        if (!data.length || data.some(d => !Number.isFinite(d.year)
            || !Number.isFinite(d.hospitalisations) || d.hospitalisations < 0
            || !statuses.includes(d.status) || !ageGroups.includes(d.ageGroup)
            || !halves.includes(d.half) || d.cause !== "Traffic")) {
            throw new Error("The chart CSV contains missing or unexpected values.");
        }

        // Keep 2014 in the source CSV, but omit it from this chart's year choices.
        const years = Array.from(new Set(data.map(d => d.year)))
            .filter(year => year !== 2014)
            .sort(d3.ascending);
        let selectedYear = years[0];

        // Sum the two halves of each year, keeping the populations separate.
        const annualData = new Map(years.map(year => {
            const yearData = data.filter(d => d.year === year);
            let missingRecords = 0;
            const groups = statuses.map(status => {
                const groupData = yearData.filter(d => d.status === status);
                const group = { status };

                ageGroups.forEach(age => {
                    const ageData = groupData.filter(d => d.ageGroup === age);
                    halves.forEach(half => {
                        if (!ageData.some(d => d.half === half)) missingRecords += 1;
                    });
                    group[age] = d3.sum(ageData, d => d.hospitalisations);
                });

                group.total = d3.sum(ageGroups, age => group[age]);
                return group;
            });
            return [year, { groups, missingRecords }];
        }));

        slider
            .attr("min", 0)
            .attr("max", years.length - 1)
            .property("value", 0)
            .property("disabled", false);
        d3.select(".year-endpoints span:first-child").text(years[0]);
        d3.select(".year-endpoints span:last-child").text(years[years.length - 1]);

        const legendItems = d3.select("#age-legend")
            .selectAll("li")
            .data(ageGroups)
            .join("li");

        legendItems.append("span")
            .attr("class", "age-swatch")
            .style("background-color", d => colours(d));
        legendItems.append("span").text(d => d);

        chart.select(".chart-loading").remove();

        const hideTooltip = () => tooltip.property("hidden", true);

        const showTooltip = (event, d) => {
            tooltip
                .text(`${d.data.status} · ${selectedYear}\nAge ${d.ageGroup}: ${formatCount(d.count)} hospitalisations\n${formatShare(d[1] - d[0])} of this population's total`)
                .property("hidden", false);

            // Use the segment position for both mouse and keyboard users.
            const containerBounds = chart.node().getBoundingClientRect();
            const segmentBounds = event.currentTarget.getBoundingClientRect();
            const tooltipBounds = tooltip.node().getBoundingClientRect();
            const left = Math.max(0, Math.min(
                segmentBounds.left - containerBounds.left + segmentBounds.width / 2 - tooltipBounds.width / 2,
                containerBounds.width - tooltipBounds.width
            ));
            const top = Math.max(0, segmentBounds.top - containerBounds.top - tooltipBounds.height - 8);

            tooltip.style("left", `${left}px`).style("top", `${top}px`);
        };

        const drawChart = () => {
            hideTooltip();
            yearOutput.text(selectedYear);
            slider.attr("aria-valuetext", String(selectedYear));

            const current = annualData.get(selectedYear);
            const complete = current && current.missingRecords === 0;
            const viewWidth = chart.node().clientWidth;
            const compact = viewWidth < 600;
            const viewHeight = 290;
            const margin = { top: 30, right: 16, bottom: 64, left: compact ? 122 : 174 };
            const innerWidth = Math.max(1, viewWidth - margin.left - margin.right);
            const innerHeight = viewHeight - margin.top - margin.bottom;

            const svg = chart.selectAll("svg")
                .data([null])
                .join("svg")
                .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
                .attr("role", "group")
                .attr("aria-labelledby", "age-chart-heading")
                .attr("aria-describedby", "age-chart-summary age-chart-note");
            svg.selectAll("*").remove();

            const plot = svg.append("g")
                .attr("transform", `translate(${margin.left}, ${margin.top})`);

            const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
            const yScale = d3.scaleBand()
                .domain(statuses)
                .range([0, innerHeight])
                .padding(0.4);
            const ticks = compact ? [0, 0.5, 1] : d3.range(0, 1.01, 0.2);

            plot.append("g")
                .attr("class", "age-grid")
                .attr("transform", `translate(0, ${innerHeight})`)
                .call(d3.axisBottom(xScale).tickValues(ticks).tickSize(-innerHeight).tickFormat(""))
                .call(g => g.select(".domain").remove());

            plot.append("g")
                .attr("class", "age-axis")
                .attr("transform", `translate(0, ${innerHeight})`)
                .call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(d3.format(".0%")));

            const labels = plot.append("g")
                .attr("class", "age-population-labels")
                .selectAll("text")
                .data(statuses)
                .join("text")
                .attr("x", -12)
                .attr("y", d => yScale(d) + yScale.bandwidth() / 2)
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "middle");

            labels.each(function (status) {
                const lines = compact && status === "First Nations people" ? ["First Nations", "people"] : [status];
                d3.select(this).selectAll("tspan")
                    .data(lines)
                    .join("tspan")
                    .attr("x", -12)
                    .attr("dy", (line, i) => i === 0 ? (lines.length === 2 ? "-0.6em" : 0) : "1.2em")
                    .text(line => line);
            });

            svg.append("text")
                .attr("class", "age-axis-label")
                .attr("x", compact ? viewWidth / 2 : margin.left + innerWidth / 2)
                .attr("y", viewHeight - 12)
                .attr("text-anchor", "middle")
                .text(compact ? "Share of hospitalisations" : "Share of hospitalisations within each population");

            if (!complete) {
                summary.text(`${selectedYear}: annual comparison unavailable.`);
                note.classed("chart-note-warning", true)
                    .text(`${selectedYear} has ${current ? current.missingRecords : 24} missing half-year age-group records. Bars are omitted because complete annual percentages cannot be calculated. Missing records are not treated as zero.`);
                return;
            }

            const stack = d3.stack().keys(ageGroups).offset(d3.stackOffsetExpand);
            const series = stack(current.groups);

            plot.selectAll(".age-series")
                .data(series)
                .join("g")
                .attr("class", "age-series")
                .attr("fill", d => colours(d.key))
                .selectAll("rect")
                .data(series => series.map(segment => {
                    segment.ageGroup = series.key;
                    segment.count = segment.data[series.key];
                    return segment;
                }))
                .join("rect")
                .attr("class", "age-segment")
                .attr("x", d => xScale(d[0]))
                .attr("y", d => yScale(d.data.status))
                .attr("width", d => Math.max(0, xScale(d[1]) - xScale(d[0])))
                .attr("height", yScale.bandwidth())
                .attr("tabindex", 0)
                .attr("role", "img")
                .attr("aria-label", d => `${d.data.status}, age ${d.ageGroup}, ${formatCount(d.count)} hospitalisations, ${formatShare(d[1] - d[0])}`)
                .on("pointerenter focus", showTooltip)
                .on("pointerleave blur", hideTooltip)
                .on("keydown", event => { if (event.key === "Escape") hideTooltip(); });

            summary.text(`${selectedYear} totals — ${current.groups.map(group => `${group.status}: ${formatCount(group.total)} hospitalisations`).join("; ")}.`);
            note.classed("chart-note-warning", false)
                .text("Move the year slider to compare years. Hover over or focus a segment to see its count and percentage.");
        };

        slider.on("input", event => {
            // Slider positions map to the available years, skipping 2014.
            selectedYear = years[+event.target.value];
            drawChart();
        });

        drawChart();
        const resizeObserver = new ResizeObserver(drawChart);
        resizeObserver.observe(chart.node());
    }).catch(error => {
        console.error("Unable to load the age distribution chart:", error);
        chart.select(".chart-loading").remove();
        chart.selectAll("svg").remove();
        slider.property("disabled", true);
        summary.text("The chart could not be loaded.");
        note.classed("chart-note-warning", true)
            .text("Please reload the page. If the problem continues, check that the chart CSV is available in the data folder.");
    });
};

loadFirstNationsAgeChart();
