import React from "react";
import ReactApexChart from "react-apexcharts";

function Chart({ paymentHistory }) {

  //Error Occ
  // let paymentDates = []
  // for (let i = 0; i < paymentHistory.length; i++) {
  //   const newDate = new Date(paymentHistory[i].datePaid);
  //   let localDate = newDate.toLocaleDateString();
  //   paymentDates = [...paymentDates, localDate]
  // }

  //Fixed
  let paymentDates = paymentHistory.map((payment) =>
    new Date(payment.datePaid).toISOString()
  );

  //Error
  // let paymentReceived = []
  // for (let i = 0; i < paymentHistory.length; i++) {
  //   paymentReceived = [...paymentReceived, paymentHistory[i].amountPaid]
  // }
  //Fixed
  let paymentReceived = paymentHistory.map((payment) =>
    payment.amountPaid ? payment.amountPaid : 0
  );
  



  const series = [
    {
      name: "Payment Recieved",
      data: paymentReceived,
    },
  ];
  // const options = {
  //   chart: {
  //     zoom: { enabled: false },
  //     toolbar: { show: false },
  //   },
  //   dataLabels: {
  //     enabled: false,
  //   },

  //   stroke: {
  //     curve: "smooth",
  //   },
  //   xaxis: {
  //     type: "datetime",
  //     categories: paymentDates,
  //   },
  //   tooltip: {
  //     x: {
  //       format: "dd/MM/yy",
  //     },
  //   },
  // };
  const options = {
    chart: {
      zoom: { enabled: false },
      toolbar: { show: false },
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" },
    xaxis: {
      type: "datetime",
      categories: paymentDates,
    },
    tooltip: {
      x: { format: "dd/MM/yy" },
    },
  };
  

  return (
    <div
      style={{
        backgroundColor: "white",
        textAlign: "center",
        width: '90%',
        margin: '10px auto',
        padding: '10px'
      }}
    >
      <br />
      <ReactApexChart
        options={options}
        series={series}
        type="bar"
        height={300}

      />
    </div>
  );
}

export default Chart