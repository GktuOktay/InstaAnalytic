# InstaAnalytic Köprüsü (Chrome eklentisi)

InstaAnalytic, gönderilerinizi kimin beğendiğini ve kimin yorum yaptığını bilmek ister. Bunu sunucudan
Instagram'a istek atarak yapmak bot gibi görünür. Bu eklenti onun yerine, zaten giriş yapmış olduğunuz
Chrome'dan, Instagram web sitesinin bir gönderide "beğenenler"e tıkladığınızda yaptığı isteğin aynısını yapar.

Ne isteneceğine ve ne kadar bekleneceğine bu bilgisayarda çalışan InstaAnalytic karar verir. Eklenti
yalnızca sırayla şunu yapar:

1. Uygulamaya "sıradaki iş ne?" diye sorar.
2. İstenen adresi açık Instagram sekmenizin içinden getirir.
3. Yanıtı olduğu gibi uygulamaya geri yollar ve söylenen süre kadar bekler.

## Kurulum

1. Chrome'da `chrome://extensions` adresini açın.
2. Sağ üstten **Geliştirici modu**'nu açın.
3. **Paketlenmemiş öğe yükle**'ye tıklayın ve bu klasörü (`frontend/extension`) seçin.
4. Instagram zaten bir sekmede açıksa o sekmeyi bir kez yenileyin.

## Kullanım

1. InstaAnalytic'i başlatın (varsayılan adres `http://localhost:3002`).
2. Chrome'da Instagram'a giriş yapın ve bir sekmede açık bırakın.
3. Araç çubuğundaki eklenti simgesine tıklayın, **Beğenenleri toplamaya izin ver**'i açın.
4. Instagram hesabınız uygulamadaki bir profille otomatik eşleşmezse listeden profili seçin.

Bundan sonra yapmanız gereken bir şey yok. Pencerede o anki durumu, bugün kaç istek yapıldığını ve
bir sonraki denemenin ne zaman olacağını görürsünüz. **Şimdi dene** düğmesi beklemeden bir tur çalıştırır;
uygulamanın koyduğu bekleme süreleri yine geçerlidir.

Eklenti bilerek yavaştır ve yalnızca şu durumda çalışır:

- izin anahtarı açıkken,
- son 5 dakika içinde bilgisayarı kullanmışsanız,
- Instagram bir sekmede açıkken.

Uygulama kapalıysa 1, 5 ve 15 dakika aralıklarla tekrar bakar; açıldığında kendiliğinden devam eder.

### Uygulama adresi

Yalnızca bu bilgisayardaki adresler (`localhost` veya `127.0.0.1`) kabul edilir. 3002 dışında bir port
kullanıyorsanız `manifest.json` içindeki `host_permissions` listesine o adresi de ekleyip eklentiyi
`chrome://extensions` sayfasından yeniden yükleyin.

## Asla yapmadıkları

- Kendi başına sekme açmaz, sayfada bir şeye tıklamaz, beğenmez, takip etmez, mesaj atmaz.
- Yalnızca üç tür adresi okur: profil gönderi listesi, bir gönderiyi beğenenler ve yorumlar. Uygulama
  başka bir şey isterse reddeder.
- Başarısız bir Instagram isteğini kendi başına tekrar denemez; ne olacağına uygulama karar verir.
- Instagram'dan gelen veriyi ayarlardaki yerel uygulama adresi dışında hiçbir yere göndermez.
- Çerezlerinizi kopyalamaz, kaydetmez, günlüğe yazmaz. Yalnızca hangi hesapla giriş yapıldığını
  anlamak için `ds_user_id` çerezine bakar.
- Uzaktan kod yüklemez, dış kütüphane kullanmaz.

## Kaldırma

Durdurmak için eklenti penceresindeki anahtarı kapatmanız yeterli. Tamamen kaldırmak için
`chrome://extensions` sayfasında **InstaAnalytic Köprüsü**'nü bulup **Kaldır**'a tıklayın; eklentinin
sakladığı ayarlar da onunla birlikte silinir.
