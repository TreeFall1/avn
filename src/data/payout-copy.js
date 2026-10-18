export const payoutCopy = {
  ru: {
    methods: 'Способы выплаты', choose: 'Выберите способ выплаты', change: 'Сменить', fee: 'Комиссия 1%',
    receive: 'Получить', network: 'Сеть', payoutDate: 'Дата выплаты',
    calculateOnly: 'Предварительный расчёт. Выплата не отправляется.',
    minimum: 'Выберите скины на сумму от 100 ₽, чтобы выбрать способ вывода.',
    otherBank: 'Другой банк', bankPlaceholder: 'Название банка',
    labels: { email: 'Ваш email', card: 'Номер карты', fullName: 'ФИО получателя', phone: 'Номер телефона', bank: 'Название банка', iban: 'IBAN', wallet: 'Адрес кошелька', steamProfile: 'Профиль Steam' },
    errors: {
      required: 'Заполните это поле.', email: 'Укажите корректный email.', card: 'Проверьте номер карты.',
      fullName: 'Укажите имя получателя.', phone: 'Укажите российский номер: +7 и 10 цифр.',
      iban: 'Проверьте IBAN.', wallet: 'Проверьте формат адреса для выбранной сети.',
      steamProfile: 'Укажите ссылку на профиль https://steamcommunity.com/profiles/… или /id/…',
    },
  },
  en: {
    methods: 'Payout methods', choose: 'Choose a payout method', change: 'Change', fee: '1% fee',
    receive: 'Receive', network: 'Network', payoutDate: 'Payout date',
    calculateOnly: 'Estimated calculation. No payout will be sent.',
    minimum: 'Select at least ₽100 worth of skins to choose a payout method.',
    otherBank: 'Other bank', bankPlaceholder: 'Bank name',
    labels: { email: 'Your email', card: 'Card number', fullName: 'Recipient’s full name', phone: 'Phone number', bank: 'Bank name', iban: 'IBAN', wallet: 'Wallet address', steamProfile: 'Steam profile' },
    errors: {
      required: 'Fill in this field.', email: 'Enter a valid email address.', card: 'Check the card number.',
      fullName: 'Enter the recipient’s name.', phone: 'Enter a Russian phone number: +7 and 10 digits.',
      iban: 'Check the IBAN.', wallet: 'Check the address format for the selected network.',
      steamProfile: 'Enter a profile URL: https://steamcommunity.com/profiles/… or /id/…',
    },
  },
};
