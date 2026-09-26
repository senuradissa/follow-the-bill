// Person C: replace this with the real four-step flow.
// Example of calling the backend:
fetch("/api/bills")
  .then((resp) => resp.json())
  .then((bills) => {
    document.getElementById("output").textContent = JSON.stringify(bills, null, 2);
  });
