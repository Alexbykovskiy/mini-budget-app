
const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const summary = document.getElementById('summary');
let expenses = JSON.parse(localStorage.getItem('expenses') || "[]");

function renderExpenses() {
    list.innerHTML = "";
    let total = 0;
    expenses.forEach((exp, index) => {
        total += Number(exp.amount);
        const li = document.createElement('li');
        li.textContent = `[${exp.category}] €${exp.amount} | ${exp.date || "—"} | ${exp.note || ""} ${exp.mileage ? '| ' + exp.mileage + ' км' : ''}`;
        list.appendChild(li);
    });
    summary.textContent = `Всего расходов: €${total.toFixed(2)}`;
}

form.onsubmit = (e) => {
    e.preventDefault();
    const category = document.getElementById('category').value;
    const amount = document.getElementById('amount').value;
    const mileage = document.getElementById('mileage').value;
    const date = document.getElementById('date').value;
    const note = document.getElementById('note').value;

    const expense = { category, amount, mileage, date, note };
    expenses.push(expense);
    localStorage.setItem('expenses', JSON.stringify(expenses));
    form.reset();
    renderExpenses();
};

renderExpenses();
