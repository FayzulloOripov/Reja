import { Button, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./layout";

export function InviteEmail(props: { heading: string; body: string; button: string; expires: string; footer: string; url: string; lang: string }) {
  return (
    <EmailLayout preview={props.body} footer={props.footer} lang={props.lang}>
      <Text style={emailStyles.h1}>{props.heading}</Text>
      <Text style={emailStyles.p}>{props.body}</Text>
      <Section style={{ margin: "20px 0" }}>
        <Button href={props.url} style={emailStyles.button}>
          {props.button}
        </Button>
      </Section>
      <Text style={emailStyles.muted}>{props.expires}</Text>
    </EmailLayout>
  );
}
