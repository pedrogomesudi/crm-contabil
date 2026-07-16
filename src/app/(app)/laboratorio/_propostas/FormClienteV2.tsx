import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { ClienteFicticio } from "../_dados";

// Proposta visual do cadastro. Só apresentação: a vitrine não salva. Ao promover, o
// action/useActionState e a busca na Receita do FormCliente atual voltam intactos — a
// regra do saldo-ui.md é que re-skin nunca refuncionaliza.
//
// Os spans vêm da NATUREZA do dado: UF tem 2 letras, CEP tem 8 dígitos, razão social é
// longa. O formulário de hoje usa grid-cols-2 uniforme e dá à UF a largura de "Logradouro".
export function FormClienteV2({
  cliente,
  contadores,
}: {
  cliente: ClienteFicticio;
  contadores: { id: string; nome: string }[];
}) {
  const end = cliente.endereco;
  return (
    <Container>
      <div className="space-y-4">
        <Secao titulo="Cadastrais e fiscais" descricao="Identificação e enquadramento">
          <FormGrid>
            <FormCampo label="Tipo de pessoa" span={2}>
              <Select name="tipo_pessoa" defaultValue={cliente.tipo_pessoa}>
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </Select>
            </FormCampo>
            <FormCampo label="CPF / CNPJ" span={3}>
              <Input name="cpf_cnpj" defaultValue={cliente.cpf_cnpj ?? ""} className="tabular-nums" />
            </FormCampo>
            <FormCampo label="Razão social / Nome" span={7}>
              <Input name="razao_social" defaultValue={cliente.razao_social} />
            </FormCampo>
            <FormCampo label="Nome fantasia" span={5}>
              <Input name="nome_fantasia" defaultValue={cliente.nome_fantasia ?? ""} />
            </FormCampo>
            <FormCampo label="Regime tributário" span={3}>
              <Select name="regime_tributario" defaultValue={cliente.regime_tributario ?? ""}>
                <option value="Simples">Simples</option>
                <option value="Presumido">Presumido</option>
                <option value="Real">Real</option>
              </Select>
            </FormCampo>
            <FormCampo label="Inscrição estadual" span={2}>
              <Input name="inscricao_estadual" defaultValue={cliente.inscricao_estadual ?? ""} />
            </FormCampo>
            <FormCampo label="Inscrição municipal" span={2}>
              <Input name="inscricao_municipal" defaultValue={cliente.inscricao_municipal ?? ""} />
            </FormCampo>
          </FormGrid>
        </Secao>

        <Secao titulo="Contato e endereço">
          <FormGrid>
            <FormCampo label="E-mail" span={5}>
              <Input name="email" type="email" defaultValue={cliente.email ?? ""} />
            </FormCampo>
            <FormCampo label="Telefone" span={3}>
              <Input name="telefone" defaultValue={cliente.telefone ?? ""} />
            </FormCampo>
            <FormCampo label="Responsável" span={4}>
              <Input name="responsavel_nome" defaultValue={cliente.responsavel_nome ?? ""} />
            </FormCampo>
            <FormCampo label="Logradouro" span={7}>
              <Input name="logradouro" defaultValue={end.logradouro ?? ""} />
            </FormCampo>
            <FormCampo label="Número" span={2}>
              <Input name="numero" defaultValue={end.numero ?? ""} className="tabular-nums" />
            </FormCampo>
            <FormCampo label="Complemento" span={3}>
              <Input name="complemento" defaultValue={end.complemento ?? ""} />
            </FormCampo>
            <FormCampo label="Bairro" span={5}>
              <Input name="bairro" defaultValue={end.bairro ?? ""} />
            </FormCampo>
            <FormCampo label="Cidade" span={4}>
              <Input name="cidade" defaultValue={end.cidade ?? ""} />
            </FormCampo>
            <FormCampo label="UF" span={1}>
              <Input name="uf" maxLength={2} defaultValue={end.uf ?? ""} className="uppercase" />
            </FormCampo>
            <FormCampo label="CEP" span={2}>
              <Input name="cep" defaultValue={end.cep ?? ""} className="tabular-nums" />
            </FormCampo>
          </FormGrid>
        </Secao>

        <Secao titulo="Gestão interna">
          <FormGrid>
            <FormCampo label="Contador responsável" span={5}>
              <Select name="contador_id" defaultValue={cliente.contador_id ?? ""}>
                {contadores.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.nome}
                  </option>
                ))}
              </Select>
            </FormCampo>
            <FormCampo label="Início do contrato" span={3}>
              <Input name="data_inicio" type="date" defaultValue={cliente.data_inicio ?? ""} />
            </FormCampo>
            <FormCampo label="Status" span={4}>
              <Select name="status" defaultValue={cliente.status}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormCampo>
            <FormCampo label="Observações" span={12}>
              <Textarea name="observacoes" rows={3} />
            </FormCampo>
          </FormGrid>
        </Secao>
      </div>
    </Container>
  );
}
