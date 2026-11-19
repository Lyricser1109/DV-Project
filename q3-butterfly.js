// Compare male and female hospitalisation counts on a shared, mirrored scale.
const loadSexAgeButterflyChart = () => {
    const chart = d3.select("#sex-age-chart");
    const tooltip = d3.select("#sex-age-tooltip");
    const summary = d3.select("#sex-age-summary");
    const note = d3.select("#sex-age-note");
    const ageGroups = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
    const sexes = ["Male", "Female"];
    const colours = { Male: "#5572c7", Female: "#c45e71" };
    const formatCount = d3.format(",d");
    const formatShare = d3.format(".1%");

    d3.csv("data/sex-age-hospitalisations.csv", d => ({
        year: +d["Calendar year"],
        ageGroup: d["Age group"],
        sex: d.Sex,
        count: d.Hospitalisations.trim() === "" ? NaN : +d.Hospitalisations
    })).then(data => {
        if (!data.length || data.some(d => !Number.isInteger(d.year)
            || !Number.isInteger(d.count) || d.count < 0
            || ![...sexes, "Unknown"].includes(d.sex)
            || ![...ageGroups, "Unknown"].includes(d.ageGroup))) {
            throw new Error("The age and sex CSV contains missing or unexpected values.");
        }

        const years = d3.extent(data, d => d.year);
        const period = `${years[0]}–${years[1]}`;
        const knownData = data.filter(d => sexes.includes(d.sex) && ageGroups.includes(d.ageGroup));
        const excludedCount = d3.sum(data.filter(d => !sexes.includes(d.sex) || !ageGroups.includes(d.ageGroup)), d => d.count);

        // The CSV retains year-level totals; this chart combines all supplied years.
        const counts = d3.rollup(knownData, values => d3.sum(values, d => d.count), d => d.ageGroup, d => d.sex);
        const rows = ageGroups.map(age => ({
            age,
            Male: counts.get(age)?.get("Male") ?? 0,
            Female: counts.get(age)?.get("Female") ?? 0
        }));
        const totals = Object.fromEntries(sexes.map(sex => [sex, d3.sum(rows, row => row[sex])]));
        // Tooltip percentages use both sexes and all displayed ages as the denominator.
        const overallTotal = totals.Male + totals.Female;
        if (overallTotal === 0) throw new Error("No hospitalisations are available for this comparison.");
        const peakMale = d3.greatest(rows, row => row.Male);
        const peakFemale = d3.greatest(rows, row => row.Female);

        const peakText = peakMale.age === peakFemale.age
            ? `The highest counts occur at ages ${peakMale.age} for both sexes.`
            : `The highest counts occur at ages ${peakMale.age} for males and ${peakFemale.age} for females.`;
        summary.text(`${period} totals: ${formatCount(totals.Male)} male and ${formatCount(totals.Female)} female hospitalisations. ${peakText}`);
        note.text(`Counts describe recorded hospitalisations rather than population injury rates. Tooltip percentages use the combined total of ${formatCount(overallTotal)} hospitalisations with known sex and age. ${formatCount(excludedCount)} hospitalisations with unknown sex or age are excluded.`);
        chart.select(".chart-loading").remove();

        const hideTooltip = () => tooltip.property("hidden", true);
        const showTooltip = (event, d) => {
            tooltip
                .text(`${d.sex} · Age ${d.age}\n${formatCount(d.count)} hospitalisations (${period})\n${formatShare(d.share)} of all displayed hospitalisations`)
                .property("hidden", false);

            const chartBounds = chart.node().getBoundingClientRect();
            const barBounds = event.currentTarget.getBoundingClientRect();
            const tooltipBounds = tooltip.node().getBoundingClientRect();
            const left = Math.max(0, Math.min(
                barBounds.left - chartBounds.left + barBounds.width / 2 - tooltipBounds.width / 2,
                chartBounds.width - tooltipBounds.width
            ));
            const top = Math.max(0, barBounds.top - chartBounds.top - tooltipBounds.height - 8);
            tooltip.style("left", `${left}px`).style("top", `${top}px`);
        };

        const drawChart = () => {
            hideTooltip();
            const width = chart.node().clientWidth;
            const compact = width < 600;
            const height = 450;
            const margin = { top: 46, right: 12, bottom: 66, left: 12 };
            const centreGap = compact ? 76 : 106;
            const sideWidth = Math.max(1, (width - margin.left - margin.right - centreGap) / 2);
            const leftZero = margin.left + sideWidth;
            const rightZero = leftZero + centreGap;
            const chartBottom = height - margin.bottom;

            const countScale = d3.scaleLinear()
                .domain([0, d3.max(rows, row => Math.max(row.Male, row.Female))])
                .nice()
                .range([0, sideWidth]);
            const maximum = countScale.domain()[1];
            const leftScale = d3.scaleLinear().domain([0, maximum]).range([leftZero, margin.left]);
            const rightScale = d3.scaleLinear().domain([0, maximum]).range([rightZero, width - margin.right]);
            const yScale = d3.scaleBand()
                .domain(ageGroups)
                .range([margin.top, chartBottom])
                .padding(0.28);
            const ticks = compact ? [0, maximum] : countScale.ticks(4);

            const svg = chart.selectAll("svg")
                .data([null])
                .join("svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("role", "group")
                .attr("aria-labelledby", "sex-age-heading")
                .attr("aria-describedby", "sex-age-summary sex-age-note");
            svg.selectAll("*").remove();

            // Both sides show positive counts; direction indicates the sex category.
            [leftScale, rightScale].forEach(scale => {
                svg.append("g")
                    .attr("class", "butterfly-grid")
                    .attr("transform", `translate(0, ${chartBottom})`)
                    .call(d3.axisBottom(scale).tickValues(ticks).tickSize(-(chartBottom - margin.top)).tickFormat(""))
                    .call(g => g.select(".domain").remove());

                svg.append("g")
                    .attr("class", "butterfly-axis")
                    .attr("transform", `translate(0, ${chartBottom})`)
                    .call(d3.axisBottom(scale).tickValues(ticks).tickFormat(d3.format("~s")));
            });

            svg.selectAll(".butterfly-zero")
                .data([leftZero, rightZero])
                .join("line")
                .attr("class", "butterfly-zero")
                .attr("x1", d => d)
                .attr("x2", d => d)
                .attr("y1", margin.top)
                .attr("y2", chartBottom);

            // Separate the age labels with subtle lines confined to the centre gap.
            svg.selectAll(".butterfly-age-separator")
                .data(ageGroups.slice(0, -1))
                .join("line")
                .attr("class", "butterfly-age-separator")
                .attr("aria-hidden", "true")
                .attr("x1", leftZero + 6)
                .attr("x2", rightZero - 6)
                .attr("y1", age => yScale(age) + yScale.bandwidth() / 2 + yScale.step() / 2)
                .attr("y2", age => yScale(age) + yScale.bandwidth() / 2 + yScale.step() / 2);

            svg.selectAll(".butterfly-heading")
                .data([
                    { text: "Male", x: margin.left + sideWidth / 2, colour: colours.Male },
                    { text: "Age group", x: width / 2, colour: "#182b3c" },
                    { text: "Female", x: rightZero + sideWidth / 2, colour: colours.Female }
                ])
                .join("text")
                .attr("class", "butterfly-heading")
                .attr("x", d => d.x)
                .attr("y", 22)
                .attr("text-anchor", "middle")
                .attr("fill", d => d.colour)
                .text(d => d.text);

            const rowGroups = svg.selectAll(".butterfly-row")
                .data(rows)
                .join("g")
                .attr("class", "butterfly-row")
                .attr("transform", d => `translate(0, ${yScale(d.age)})`);

            rowGroups.append("text")
                .attr("class", "butterfly-age")
                .attr("x", width / 2)
                .attr("y", yScale.bandwidth() / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .text(d => d.age);

            const barData = row => sexes.map(sex => ({
                age: row.age,
                sex,
                count: row[sex],
                share: row[sex] / overallTotal
            }));
            rowGroups.selectAll(".sex-age-bar")
                .data(barData)
                .join("path")
                .attr("class", "sex-age-bar")
                .attr("d", d => {
                    const barWidth = countScale(d.count);
                    const barHeight = yScale.bandwidth();
                    const radius = Math.min(barHeight / 2, barWidth);

                    // Round only the outer end; the edge at the centre stays flat.
                    if (d.sex === "Male") {
                        const outer = leftZero - barWidth;
                        return `M${leftZero},0 H${outer + radius} A${radius},${radius} 0 0 0 ${outer},${radius} V${barHeight - radius} A${radius},${radius} 0 0 0 ${outer + radius},${barHeight} H${leftZero} Z`;
                    }

                    const outer = rightZero + barWidth;
                    return `M${rightZero},0 H${outer - radius} A${radius},${radius} 0 0 1 ${outer},${radius} V${barHeight - radius} A${radius},${radius} 0 0 1 ${outer - radius},${barHeight} H${rightZero} Z`;
                })
                .attr("fill", d => colours[d.sex])
                .attr("tabindex", 0)
                .attr("role", "img")
                .attr("aria-label", d => `${d.sex}, age ${d.age}, ${formatCount(d.count)} hospitalisations, ${formatShare(d.share)} of all displayed hospitalisations, ${period}`)
                .on("pointerenter focus click", showTooltip)
                .on("pointerleave blur", hideTooltip)
                .on("keydown", event => { if (event.key === "Escape") hideTooltip(); });

            // Keep exact counts inside wide bars and beside narrower bars.
            const valueLabels = rowGroups.selectAll(".butterfly-value")
                .data(barData)
                .join("text")
                .attr("class", "butterfly-value")
                .attr("y", yScale.bandwidth() / 2)
                .attr("dominant-baseline", "middle")
                .style("font-size", width < 280 ? "10px" : null)
                .text(d => formatCount(d.count));

            // Measure each label so it still fits when the chart becomes narrow.
            valueLabels.each(function (d) {
                const barWidth = countScale(d.count);
                const inside = barWidth >= this.getComputedTextLength() + 6;
                const x = d.sex === "Male"
                    ? leftZero - barWidth + (inside ? 3 : -4)
                    : rightZero + barWidth + (inside ? -3 : 4);
                d3.select(this)
                    .attr("x", x)
                    .attr("text-anchor", (d.sex === "Male") === inside ? "start" : "end")
                    .attr("fill", inside ? "#ffffff" : colours[d.sex]);
            });

            svg.append("text")
                .attr("class", "butterfly-axis-label")
                .attr("x", width / 2)
                .attr("y", height - 14)
                .attr("text-anchor", "middle")
                .text(`Hospitalisations (${period})`);
        };

        drawChart();
        const resizeObserver = new ResizeObserver(drawChart);
        resizeObserver.observe(chart.node());
    }).catch(error => {
        console.error("Unable to load the age and sex chart:", error);
        chart.select(".chart-loading").remove();
        chart.selectAll("svg").remove();
        summary.text("The age and sex chart could not be loaded.");
        note.text("Please reload the page and check that the grouped CSV is available in the data folder.");
    });
};

loadSexAgeButterflyChart();
